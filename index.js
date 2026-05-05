// ==============================
// VERSION P1
// Fixes:
// 1. Timer crash fix
// 2. Safe buffer handling
// 3. Structured logs
// 4. Root route added
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
// P1: Structured logs
function log(title, data = "") {
  console.log(`\n========== ${title} ==========`);

  if (typeof data === "object") {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

// ===== CLEAN TEXT =====
function cleanText(text) {
  return (text || "").replace(/\*/g, "").replace(/[:]/g, "").trim();
}

// ===== MONEY =====
function parseMoney(text) {
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
  const t = text.toLowerCase();

  const bhk = t.match(/(\d+)\s*bhk/)?.[1];
  const rent = parseMoney(text.match(/rent[^\n]*/i)?.[0] || "");

  let maintenanceLine = text.match(/maintenance[^\n]*/i)?.[0] || "";
  let maintenance = /including|included|inclusive/i.test(maintenanceLine)
    ? 0
    : parseMoney(maintenanceLine);

  const depositLine =
    text.match(/(deposit|advance|security|caution)[^\n]*/i)?.[0] || "";

  let deposit = parseMoney(depositLine);

  const monthMatch = depositLine.match(/(\d+)\s*month/i);
  if (monthMatch && rent) {
    deposit = Number(monthMatch[1]) * rent;
  }

  const sqft =
    text.match(/(?:sqft|sq ft|area)\s*[:\-]?\s*(\d+)/i)?.[1] ||
    text.match(/(\d{3,5})\s*(sqft|sq ft)/i)?.[1] ||
    "";

  const floor = text.match(/(\d+\s*\/\s*\d+)/)?.[1] || "";
  const bathrooms = t.match(/(\d+)\s*bath/)?.[1];

  let balcony = "";
  if (/(\d+)\s*balcon/i.test(text)) {
    balcony = text.match(/(\d+)\s*balcon/i)[1];
  } else if (/a\s*balcon/i.test(text)) {
    balcony = "1";
  }

  const availableFrom =
    text.match(/available\s*from[:\s]*([^\n]+)/i)?.[1]?.trim() || "";

  // SOCIETY
  let society = "";
  const lines = text.split("\n");

  for (let line of lines) {
    if (line.includes("maps.app.goo.gl")) {
      const before = line.split("https")[0];
      if (before.trim()) {
        society = cleanText(before);
      }
    }
  }

  if (!society) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("maps.app.goo.gl")) {
        society = cleanText(lines[i - 1] || "");
      }
    }
  }

  let location =
    cleanText(text.match(/location[:\s]*([^\n]+)/i)?.[1] || "");

  if (!location && society) location = society;

  let gated = /gated/i.test(text) ? "Gated" : "Non-Gated";

  let furnishing = "";
  if (t.includes("unfurnished")) furnishing = "Unfurnished";
  else if (t.includes("fully")) furnishing = "Fully Furnished";
  else if (t.includes("semi") || t.includes("partial"))
    furnishing = "Semi Furnished";

  let pets = "";
  if (/pets.*not/i.test(text)) pets = "No";
  else if (/pets.*allowed/i.test(text)) pets = "Yes";

  const utility = /utility/i.test(text) ? "Yes" : "No";

  let clientType =
    cleanText(text.match(/preferred\s*tenant\s*[:\-]?\s*([^\n]+)/i)?.[1] || "");

  let veg = "";
  if (/vegetarian/i.test(text)) veg = "Veg Only";
  else if (/non[-\s]?veg/i.test(text)) veg = "Non Veg";
  else veg = "No Restriction";

  let softCount = 0;
  if (sqft) softCount++;
  if (floor) softCount++;
  if (deposit) softCount++;
  if (maintenance !== "") softCount++;
  if (availableFrom) softCount++;
  if (bathrooms) softCount++;

  if (!(bhk && rent && softCount >= 2)) return null;

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
    raw: text,
  };
}

// ===== PROCESS =====
function processBuffer(sender) {
  const buffer = buffers[sender];
  if (!buffer) return;

  log("PROCESSING BUFFER", sender);

  const listings = buffer.text.split(/\n\s*\n/).filter(x => /bhk/i.test(x));

  for (let chunk of listings) {
    const data = parseListing(chunk);
    if (data) {
      pushToSheet(data, sender, buffer.messageId);
    }
  }

  delete buffers[sender];
}

// ===== PUSH =====
async function pushToSheet(d, sender, messageId) {
  const key = crypto
    .createHash("md5")
    .update(`${d.bhk}-${d.rent}-${d.location}-${d.society}`.toLowerCase())
    .digest("hex");

  log("INSERTING", {
    bhk: d.bhk,
    location: d.location,
    rent: d.rent,
  });

  const now = new Date();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        now.toLocaleString(),
        "",
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

    log("NEW MESSAGE", { sender, message });

    if (!buffers[sender]) {
      buffers[sender] = { text: "", sender, messageId, timer: null };
    }

    buffers[sender].text += "\n" + message;

    if (buffers[sender].timer) {
      clearTimeout(buffers[sender].timer);
    }

    buffers[sender].timer = setTimeout(() => {
      processBuffer(sender);
    }, 30000);

    if (message.includes("maps.app.goo.gl")) {
      processBuffer(sender);
    }

  } catch (err) {
    log("ERROR", err.message);
  }

  res.sendStatus(200);
});

// ROOT ROUTE FIX
app.get("/", (req, res) => {
  res.send("Webhook is live ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Running on ${PORT}`);
});