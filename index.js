const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 10000;

// ===== GOOGLE AUTH =====
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = "1BbuD7HbL6Hct3VbAaomx890wKsvVUvtIb4j8QJ7SFo4";

// ===== HELPERS =====
function clean(val) {
  return val ? val.toString().trim() : "";
}

// ===== DATE FORMATTER (DDMMYY) =====
function getTodayKey() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
}

// ===== PID GENERATOR =====
async function generatePID() {
  const todayKey = getTodayKey();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Live Tracking!A2:A",
  });

  const rows = response.data.values || [];

  let maxSerial = 0;

  rows.forEach(r => {
    const pid = r[0];
    if (!pid) return;

    // match EF-DDMMYY-XXX
    const match = pid.match(/^EF-(\d{6})-(\d{3})$/);

    if (match && match[1] === todayKey) {
      const serial = parseInt(match[2], 10);
      if (serial > maxSerial) maxSerial = serial;
    }
  });

  const nextSerial = String(maxSerial + 1).padStart(3, "0");

  return `EF-${todayKey}-${nextSerial}`;
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const d = req.body;

    const now = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });

    // 🔥 NEW PID LOGIC
    const PID = await generatePID();

    const row = [
      PID,
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
      now, // Date Added
      now, // Last Updated
      clean(d.messageId) || "manual",
      clean(d.senderPhone) || "manual",
      clean(d.rawMessage) || JSON.stringify(d),
      clean(d.messageTimestamp) || now
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Live Tracking!A:AB",
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });

    res.send(`Data added with PID ${PID} ✅`);

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
