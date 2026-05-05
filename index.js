// ==============================
// VERSION P4
// Changes:
// 1. REMOVED smart split logic (over-engineered for current use case)
// 2. Treat entire buffer as ONE listing (matches real WhatsApp usage)
// 3. Fixed crash: undefined.match (added input safety)
// 4. Added inline change comments (Capgemini style)
// 5. Simplified processing → more stable production behavior
// 6. FIXED buffer overwrite issue (prevents message mixing)
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
// P4 CHANGE:
// Added safety check to prevent crash when text is undefined
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
// P4 CHANGE:
// Added full input safety + simplified logic
function parseListing(text) {
  if (!text || text.trim().length < 20) return null;

  const t = normalize(text);

  const bhk = t.match(/(\d+(\.\d+)?)\s*bhk/)?.[1];
  const rent = parseMoney(text.match(/rent[^\n]*/i)?.[0] || "");

  if (!bhk || !rent) {
    log("SKIPPED LISTING", "Missing BHK or Rent");
    return null;
  }

  let furnishing = "";

  if (/\bunfurnished\b/.test(t)) furnishing = "Unfurnished";
  else if (/\bfully\b/.test(t)) furnishing = "Fully Furnished";
  else if (/\bsemi\b|\bpartial\b/.test(t))
    furnishing = "Semi Furnished";

  return {
    bhk: `${bhk} BHK`,
    rent,
    furnishing,
    location: "",
    society: "",
    raw: text,
  };
}

// ===== PROCESS =====
// P4 CHANGE:
// Single listing processing (no split)
async function processBuffer(sender) {
  const buffer = buffers[sender];
  if (!buffer) return;

  log("PROCESSING BUFFER", sender);

  if (buffer.timer) clearTimeout(buffer.timer);

  const chunk = buffer.text;

  try {
    const data = parseListing(chunk);

    if (data) {
      await pushToSheet(data, sender, buffer.messageId);
    } else {
      log("NO VALID LISTING FOUND");
    }
  } catch (err) {
    log("PARSE ERROR", err.message);
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
    rent: d.rent
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
        "",
        d.society,
        d.bhk,
        "",
        "",
        "",
        "",
        "",
        d.furnishing,
        "",
        "",
        "",
        d.rent,
        "",
        "",
        "",
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

    log("NEW MESSAGE", { sender });

    // P4 CHANGE:
    // Always overwrite buffer → prevents multi-message mixing
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

// ROOT
app.get("/", (req, res) => {
  res.send("Webhook is live ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Running on ${PORT}`);
});