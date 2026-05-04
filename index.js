const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ===== SHEET CONFIG =====
const SPREADSHEET_ID = "1BbuD7HbL6Hct3VbAaomx890wKsvVUvtIb4j8QJ7SFo4";
const SHEET_NAME = "Live Tracking";

// ===== GOOGLE AUTH =====
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ===== PARSER =====
function parseListing(text) {
  if (!text) return null;

  const t = text.toLowerCase();

  const bhk = t.match(/(\d+)\s*bhk/)?.[1];
  const rent = t.match(/rent[:\s]*([\d.]+)\s*k/)?.[1];
  const maintenance = t.match(/maintenance[:\s]*([\d.]+)\s*k/)?.[1];
  const deposit = t.match(/deposit[:\s]*([\d.]+)\s*l/)?.[1];
  const sqft = t.match(/(sqft|area)[:\s]*([\d]+)/)?.[2];
  const floor = t.match(/floor[:\s]*([\d/]+)/)?.[1];
  const bathrooms = t.match(/(\d+)\s*bath/)?.[1];
  const balcony = t.match(/(\d+)\s*balcon/)?.[1];

  // NEW FIXES 👇
  const availableFrom =
    text.match(/available\s*from[:\s]*([^\n]+)/i)?.[1]?.trim() || "";

  const society =
    text.match(/\*\s*([^\n]+)\s*\*\s*https/i)?.[1]?.trim() || "";

  const utility = t.includes("utility") ? "Yes" : "No";

  const location =
    text.match(/location[:\s]*\*?(.+)/i)?.[1]?.replace(/\*/g, "").trim() || "";

  const furnishing =
    t.includes("fully") ? "Fully Furnished" :
    t.includes("semi") ? "Semi Furnished" :
    "Unfurnished";

  const pets = t.includes("pets: allowed") ? "Yes" : "No";

  if (!bhk || !rent) return null;

  return {
    bhk: `${bhk} BHK`,
    rent: Number(rent) * 1000,
    maintenance: maintenance ? Number(maintenance) * 1000 : "",
    deposit: deposit ? `${deposit} L` : "",
    sqft: sqft || "",
    floor: floor || "",
    location,
    bathrooms: bathrooms || "",
    balcony: balcony || "",
    furnishing,
    pets,
    availableFrom,
    society,
    utility,
    raw: text,
  };
}

// ===== DUPLICATE HANDLING =====
const cache = new Set();

function isDuplicate(d) {
  const key = `${d.bhk}-${d.rent}-${d.location}`;

  if (cache.has(key)) {
    console.log("⚠️ Skipped duplicate");
    return true;
  }

  cache.add(key);
  setTimeout(() => cache.delete(key), 300000);

  return false;
}

// ===== PUSH TO SHEET =====
async function pushToSheet(d, sender, messageId) {
  try {
    const now = new Date();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          now.toLocaleString(),   // A PID
          "Online",               // B
          d.location,             // C
          "Gated",                // D
          d.society,              // E ✅ FIXED
          d.bhk,                  // F
          d.bathrooms,            // G
          d.balcony,              // H
          d.utility,              // I ✅ FIXED
          d.sqft,                 // J
          d.floor,                // K
          d.furnishing,           // L
          "Open for All",         // M
          "No Restriction",       // N
          d.pets,                 // O
          d.rent,                 // P
          d.maintenance,          // Q
          d.deposit,              // R
          d.availableFrom,        // S ✅ FIXED
          "Open for negotiations",// T
          "",                     // U (no data yet)
          "Available",            // V
          now.toLocaleString(),   // W
          now.toLocaleString(),   // X
          messageId || "",        // Y ✅ FIXED
          sender || "",           // Z ✅ FIXED
          d.raw,                  // AA
          now.toISOString()       // AB
        ]]
      }
    });

    console.log("✅ Added SUCCESSFULLY");

  } catch (err) {
    console.error("❌ Sheet Error:", err.message);
  }
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const msgObj = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    const message = msgObj?.text?.body;
    const sender = msgObj?.from;
    const messageId = msgObj?.id;

    if (!message) return res.sendStatus(200);

    console.log("📩 FULL MESSAGE:\n", message);

    const data = parseListing(message);

    if (data && !isDuplicate(data)) {
      await pushToSheet(data, sender, messageId);
    } else {
      console.log("⚠️ Not enough data OR duplicate");
    }

  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
  }

  res.sendStatus(200);
});

// OPTIONAL ROOT CHECK
app.get("/", (req, res) => {
  res.send("Webhook is live ✅");
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Running on port ${PORT}`);
});
