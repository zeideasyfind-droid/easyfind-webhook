const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ===== SHEET CONFIG (VERIFIED) =====
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
    raw: text,
  };
}

// ===== DUPLICATE HANDLING =====
const cache = new Set();

function isDuplicate(d) {
  const key = `${d.bhk}-${d.rent}-${d.location}`;

  if (cache.has(key)) {
    console.log("⚠️ Skipped duplicate-like listing");
    console.log("DATA:", d.raw);
    return true;
  }

  cache.add(key);
  setTimeout(() => cache.delete(key), 300000);

  return false;
}

// ===== PUSH TO SHEET =====
async function pushToSheet(d) {
  try {
    const now = new Date();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          now.toLocaleString(),      // A PID (temporary timestamp)
          "Online",                  // B Onboarding Type (VALID)
          d.location,                // C Property Location
          "Gated",                   // D Apartment Type (VALID)
          "",                        // E Society Name
          d.bhk,                     // F BHK (VALID dropdown)
          d.bathrooms,               // G Bathrooms
          d.balcony,                 // H Balcony
          "",                        // I Utility
          d.sqft,                    // J Size
          d.floor,                   // K Floor
          d.furnishing,              // L Furnishing (VALID)
          "Open for All",            // M Clients Preferred (VALID)
          "No Restriction",          // N Veg/NonVeg (VALID)
          d.pets,                    // O Pets (VALID)
          d.rent,                    // P Rent
          d.maintenance,             // Q Maintenance
          d.deposit,                 // R Deposit
          "",                        // S Available From
          "Open for negotiations",   // T Scope (VALID)
          "",                        // U Visit Timing
          "Available",               // V Availability (VALID)
          now.toLocaleString(),      // W Date Added
          now.toLocaleString(),      // X Last Updated
          "",                        // Y Message ID (future)
          "",                        // Z Sender Phone (future)
          d.raw,                     // AA Raw Message
          now.toISOString()          // AB Timestamp
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
    const message =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;

    if (!message) return res.sendStatus(200);

    console.log("📩 FULL MESSAGE:\n", message);

    const data = parseListing(message);

    if (data && !isDuplicate(data)) {
      await pushToSheet(data);
    } else {
      console.log("⚠️ Not enough data OR duplicate");
    }

  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
  }

  res.sendStatus(200);
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Running on port ${PORT}`);
});
