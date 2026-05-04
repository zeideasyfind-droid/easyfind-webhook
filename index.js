const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 10000;

// ===== ENUMS =====
const ENUMS = {
  onboardingType: ["Online", "Offline Scouting", "Reference", "Broker Network", "Direct Owner"],
  apartmentType: ["Gated", "Non-Gated"],
  bhk: ["1 RK","1 BHK","1. 5 BHK","2 BHK","2.5 BHK","3 BHK","3.5 BHK","4 BHK","4.5 BHK","5 BHK","5 +"],
  furnishing: ["Fully Furnished","Semi Furnished","Unfurnished","Semi or Fully"],
  clientPreference: ["Family","Family & Bachelors Females","Family & Bachelors Males","Open for All","Hindu Family & Bachelors","Only Bachelors"],
  foodPreference: ["Veg Only","No Restriction"],
  pets: ["Yes","No"],
  negotiation: ["Open for negotiations","Slight negotiations","Fixed"],
  availability: ["Available","Delayed","Rented out"]
};

// ===== GOOGLE AUTH =====
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ===== YOUR SHEET ID =====
const SPREADSHEET_ID = "1BbuD7HbL6Hct3VbAaomx890wKsvVUvtIb4j8QJ7SFo4";

// ===== HELPERS =====
function clean(val) {
  return val ? val.toString().trim() : "";
}

function validateEnum(field, value) {
  if (value && !ENUMS[field].includes(clean(value))) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
}

function validateNumber(field, value) {
  if (value && isNaN(value)) {
    throw new Error(`${field} must be a number`);
  }
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const d = req.body;

    // VALIDATIONS
    validateEnum("onboardingType", d.onboardingType);
    validateEnum("apartmentType", d.apartmentType);
    validateEnum("bhk", d.bhk);
    validateEnum("furnishing", d.furnishing);
    validateEnum("clientPreference", d.clientPreference);
    validateEnum("foodPreference", d.foodPreference);
    validateEnum("pets", d.pets);
    validateEnum("negotiation", d.negotiation);
    validateEnum("availability", d.availability);

    ["bathrooms","balcony","utility","size","rent","maintenance","deposit"]
      .forEach(f => validateNumber(f, d[f]));

    // FINAL ROW (MATCH YOUR SHEET)
    const row = [
      "", // PID
      clean(d.onboardingType),
      clean(d.location),
      clean(d.apartmentType),
      clean(d.societyName),
      clean(d.bhk),
      d.bathrooms || "",
      d.balcony || "",
      d.utility || "",
      d.size || "",
      clean(d.floor),
      clean(d.furnishing),
      clean(d.clientPreference),
      clean(d.foodPreference),
      clean(d.pets),
      d.rent || "",
      d.maintenance || "",
      d.deposit || "",
      clean(d.availableFrom),
      clean(d.negotiation),
      clean(d.visitTimings),
      clean(d.availability),
      "", // Date Added
      "", // Last Updated
      clean(d.messageId),
      clean(d.senderPhone),
      clean(d.rawMessage),
      clean(d.messageTimestamp)
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Live Tracking!A:AB", // ✅ FIXED HERE
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });

    res.send("Data added to sheet ✅");

  } catch (err) {
    console.error(err.message);
    res.status(400).send(err.message);
  }
});

// ROOT
app.get("/", (req, res) => {
  res.send("EasyFind Webhook is LIVE 🚀");
});

// START
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
