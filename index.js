// ==============================
// VERSION P7
// Changes:.
// 1. FIX: Furnishing detection fallback (handles missing semi/fully + partial)
// 2. FIX: Society extraction edge case (*Name:* https)
// 3. FIX: Veg detection improved (checks clientType also)
// 4. FIX: Balcony fallback (handles "balcony" without number)
// 5. IMPROVEMENT: Client type normalization (safe mapping)
// 6. NO parser rewrite — only safe enhancements
// ==============================

const express = require("express");
const { google } = require("googleapis");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const SPREADSHEET_ID = "1BbuD7HbL6Hct3VbAaomx890wKsvVUvtIb4j8QJ7SFo4";
const SHEET_NAME = "Live Tracking";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const buffers = {};

// ===== LOGGER =====
function log(title, data = "") {
  console.log(`\n========== ${title} ==========`);

  if (typeof data === "object") {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

// ===== CLEAN =====
function cleanText(text) {
  return (text || "").replace(/\*/g, "").replace(/[:]/g, "").trim();
}

// ===== NORMALIZE =====
function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
}

// ===== MONEY =====
function parseMoney(text) {
  if (!text) return "";

  const match = text.match(/₹?\s*([\d,.]+)\s*(k|l|lakhs?)?/i);
  if (!match) return "";

  let val = Number(match[1].replace(/,/g, ""));
  const unit = match[2]?.toLowerCase();

  if (unit === "k") val *= 1000;
  else if (unit === "l" || unit?.includes("lakh")) val *= 100000;

  return val;
}

// ===== PARSER =====
function parseListing(text) {
  if (!text) return null;

  const t = normalize(text);

  const bhk = t.match(/(\d+(\.\d+)?)\s*bhk/)?.[1];
  const rent = parseMoney(text.match(/rent[^\n]*/i)?.[0] || "");

  if (!bhk || !rent) return null;

  const maintenanceLine = text.match(/maintenance[^\n]*/i)?.[0] || "";
  const maintenance = /including/i.test(maintenanceLine)
    ? 0
    : parseMoney(maintenanceLine);

  const depositLine =
    text.match(/(deposit|advance|security)[^\n]*/i)?.[0] || "";

  const deposit = parseMoney(depositLine);

  const sqft =
    text.match(/(?:sqft|area)[^\d]*(\d+)/i)?.[1] || "";

  // ===== FLOOR (P6 unchanged) =====
  let floor =
    text.match(/(\d+\s*\/\s*\d+)/)?.[1] ||
    text.match(/(\d+)(st|nd|rd|th)/i)?.[1] ||
    (/villa/i.test(text) ? "Villa" : "");

  const bathrooms = t.match(/(\d+)\s*bath/)?.[1] || "";

  // ===== BALCONY FIX (P7 enhancement) =====
  let balcony = "";
  if (/(\d+)\s*balcon/i.test(text)) {
    balcony = text.match(/(\d+)\s*balcon/i)[1];
  } else if (/a\s*balcon/i.test(text)) {
    balcony = "1";
  } else if (/balcon/i.test(text)) {
    balcony = "1"; // P7 fallback
  }

  const availableFrom =
    text.match(/available\s*from[:\s]*([^\n]+)/i)?.[1] || "";

  // ===== SOCIETY FIX (P7 enhancement) =====
  let society = "";
  const lines = text.split("\n");

  for (let line of lines) {
    if (line.includes("maps.app.goo.gl")) {
      let before = line.split("https")[0];
      before = before.replace(/[:]/g, ""); // P7 FIX
      if (before.trim()) {
        society = cleanText(before);
      }
    }
  }

  if (!society) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("maps.app.goo.gl")) {
        society = cleanText((lines[i - 1] || "").replace(/[:]/g, ""));
      }
    }
  }

  // ===== LOCATION =====
  let location =
    cleanText(text.match(/location[:\s]*([^\n]+)/i)?.[1] || "");

  if (!location && society) location = society;

  let gated = /gated/i.test(t) ? "Gated" : "Non-Gated";

  // ===== FURNISHING FIX (P7 enhancement) =====
  let furnishing = "";

  if (/\bunfurnished\b/.test(t)) furnishing = "Unfurnished";
  else if (/\bfully\b/.test(t)) furnishing = "Fully Furnished";
  else if (/\bsemi\b/.test(t)) furnishing = "Semi Furnished";
  else if (/\bpartial\b/.test(t)) furnishing = "Semi Furnished"; // P7 FIX
  else if (/\bfurnished\b/.test(t)) furnishing = "Fully Furnished"; // fallback

  // ===== PETS =====
  let pets = "";
  if (/pets.*not/i.test(text)) pets = "No";
  else if (/pets.*allowed/i.test(text)) pets = "Yes";

  const utility = /utility/i.test(text) ? "Yes" : "No";

  // ===== CLIENT TYPE (P7 normalization) =====
  let clientType =
    cleanText(text.match(/preferred\s*tenant[:\s]*([^\n]+)/i)?.[1] || "");

  const ct = normalize(clientType);

  if (ct.includes("anyone")) clientType = "Open for All";
  else if (ct.includes("family") && ct.includes("bachelor"))
    clientType = "Family & Bachelors";
  else if (ct.includes("family")) clientType = "Family";

  // ===== VEG FIX (P7 enhancement) =====
  let veg = "";
  if (/vegetarian/i.test(text) || /vegetarian/i.test(clientType)) {
    veg = "Veg Only";
  } else {
    veg = "No Restriction";
  }

  // ===== ONBOARDING =====
  let onboarding =
    cleanText(text.match(/onboarding type[:\s]*([^\n]+)/i)?.[1] || "");

  return {
    bhk: `${bhk} BHK`,
    rent,
    maintenance,
    deposit,
    sqft,
    floor,
    location,
    bathrooms,
    balcony,
    furnishing,
    pets,
    availableFrom,
    society,
    gated,
    utility,
    clientType,
    veg,
    onboarding,
    raw: text,
  };
}

// ===== PROCESS (UNCHANGED) =====
async function processBuffer(sender) {
  const buffer = buffers[sender];
  if (!buffer) return;

  if (buffer.timer) clearTimeout(buffer.timer);

  const listings = buffer.text.split(/(?=\d+(\.\d+)?\s*bhk)/i);

  for (let chunk of listings) {
    const data = parseListing(chunk);
    if (data) {
      await pushToSheet(data, sender, buffer.messageId);
    }
  }

  delete buffers[sender];
}

// ===== PUSH =====
async function pushToSheet(d, sender, messageId) {
  const key = crypto
    .createHash("md5")
    .update(`${d.bhk}-${d.rent}-${d.location}-${d.society}`)
    .digest("hex");

  const now = new Date();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        now.toLocaleString(),
        d.onboarding || "",
        d.location,
        d.gated,
        d.society,
        d.bhk,
        d.bathrooms,
        d.balcony,
        d.utility,
        d.sqft,
        d.floor,
        d.furnishing,
        d.clientType,
        d.veg,
        d.pets,
        d.rent,
        d.maintenance,
        d.deposit,
        d.availableFrom,
        "",
        "",
        "",
        now.toLocaleString(),
        now.toLocaleString(),
        messageId || "",
        sender || "",
        d.raw,
        now.toISOString(),
        key
      ]]
    }
  });

  log("SUCCESS", key);
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const msgObj = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    const message = msgObj?.text?.body;
    const sender = msgObj?.from;
    const messageId = msgObj?.id;

    if (!message || !sender) return res.sendStatus(200);

    buffers[sender] = {
      text: message,
      sender,
      messageId,
      timer: null
    };

    buffers[sender].timer = setTimeout(() => {
      processBuffer(sender);
    }, 30000);

    if (message.includes("maps.app.goo.gl")) {
      await processBuffer(sender);
    }

  } catch (err) {
    log("ERROR", err.message);
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Webhook is live ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Running on ${PORT}`);
});