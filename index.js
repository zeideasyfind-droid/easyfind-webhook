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
  let maintenance = 0;
  if (/including|included|inclusive/i.test(maintenanceLine)) {
    maintenance = 0;
  } else {
    maintenance = parseMoney(maintenanceLine);
  }

  const depositLine =
    text.match(/(deposit|advance|security|caution)[^\n]*/i)?.[0] || "";

  let deposit = parseMoney(depositLine);

  // HANDLE "2 months"
  const monthMatch = depositLine.match(/(\d+)\s*month/i);
  if (monthMatch && rent) {
    deposit = Number(monthMatch[1]) * rent;
  }

  const sqft = text.match(/(\d+)\s*(sqft|sq ft|area)/i)?.[1] || "";
  const floor = text.match(/(\d+\s*\/\s*\d+)/)?.[1] || "";

  const bathrooms = t.match(/(\d+)\s*bath/)?.[1];
  const balcony = t.match(/(\d+)\s*balcon/)?.[1];

  const availableFrom =
    text.match(/available\s*from[:\s]*([^\n]+)/i)?.[1]?.trim() || "";

  // ===== SOCIETY =====
  let society = "";

  // Try text-based detection (capital words)
  const lines = text.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (
      /^[A-Z][A-Za-z\s]+$/.test(line) &&
      !line.toLowerCase().includes("rent") &&
      line.split(" ").length <= 5
    ) {
      society = line;
      break;
    }
  }

  // ===== LOCATION =====
  let location =
    text.match(/location[:\s]*([^\n]+)/i)?.[1]?.trim() || "";

  if (!location && society) location = society;

  if (!location) {
    for (let line of lines) {
      line = line.trim();
      if (
        line &&
        !/\d/.test(line) &&
        line.split(" ").length <= 4 &&
        !line.toLowerCase().includes("rent")
      ) {
        location = line;
        break;
      }
    }
  }

  if (!location) location = "Unknown";

  // ===== GATED =====
  let gated = "Non-Gated";
  if (society) gated = "Gated";

  const furnishing =
    t.includes("fully") ? "Fully Furnished" :
    t.includes("semi") ? "Semi Furnished" :
    "Unfurnished";

  const pets =
    t.includes("pets") && t.includes("not") ? "No" :
    t.includes("pets") && t.includes("allowed") ? "Yes" : "";

  const utility = t.includes("utility") ? "Yes" : "No";

  let softCount = 0;
  if (sqft) softCount++;
  if (floor) softCount++;
  if (deposit) softCount++;
  if (maintenance !== "") softCount++;
  if (availableFrom) softCount++;
  if (bathrooms) softCount++;

  if (!(bhk && rent && location && softCount >= 2)) return null;

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
    raw: text,
  };
}

// ===== UNIQUE KEY =====
function generateKey(d) {
  const str = `${d.bhk}-${d.rent}-${d.location}-${d.society}`;
  return crypto.createHash("md5").update(str.toLowerCase().replace(/\s/g, "")).digest("hex");
}

// ===== GET EXISTING KEYS =====
async function getExistingKeys() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!AC2:AC`,
  });

  return new Set((res.data.values || []).flat());
}

// ===== PUSH =====
async function pushToSheet(d, sender, messageId) {
  const existingKeys = await getExistingKeys();
  const key = generateKey(d);

  if (existingKeys.has(key)) {
    console.log("⚠️ DUPLICATE:", key);
    return;
  }

  const now = new Date();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        now.toLocaleString(),
        "Online",
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
        "Open for All",
        "No Restriction",
        d.pets,
        d.rent,
        d.maintenance,
        d.deposit,
        d.availableFrom,
        "Open for negotiations",
        "",
        "Available",
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

  console.log("✅ INSERTED:", key);
}

// ===== SPLIT MULTI LISTING =====
function splitListings(text) {
  return text.split(/(?=\d+\s*bhk)/i);
}

// ===== PROCESS BUFFER =====
function processBuffer(sender) {
  const buffer = buffers[sender];
  if (!buffer) return;

  const listings = splitListings(buffer.text);

  for (let chunk of listings) {
    const data = parseListing(chunk);
    if (data) {
      pushToSheet(data, buffer.sender, buffer.messageId);
    }
  }

  delete buffers[sender];
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const msgObj = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    const message = msgObj?.text?.body;
    const sender = msgObj?.from;
    const messageId = msgObj?.id;

    if (!message) return res.sendStatus(200);

    if (!buffers[sender]) {
      buffers[sender] = { text: "", sender, messageId };
    }

    buffers[sender].text += "\n" + message;

    if (message.includes("maps.app.goo.gl")) {
      processBuffer(sender);
    }

    clearTimeout(buffers[sender].timer);
    buffers[sender].timer = setTimeout(() => {
      processBuffer(sender);
    }, 30000);

  } catch (err) {
    console.error(err);
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Webhook is live ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Running on ${PORT}`);
});