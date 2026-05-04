const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ================= CONFIG =================

const SPREADSHEET_ID = "1BbuD7HbL6Hct3VbAaomx890wKsvVUvtIb4j8QJ7SFo4";
const SHEET_NAME = "Live Tracking";

// ================= GOOGLE AUTH =================

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ================= SMART PARSER =================

function parseListing(text) {
  if (!text) return null;

  const lower = text.toLowerCase();

  const bhkMatch = lower.match(/(\d+)\s*bhk/);
  const rentMatch = lower.match(/(\d+)\s*k/);

  const locationMatch = lower.match(
    /(harlur|bellandur|hsr|koramangala|sarjapur|marathahalli|whitefield)/
  );

  if (!bhkMatch || !rentMatch) return null;

  return {
    bhk: bhkMatch[1] + " BHK",
    rent: parseInt(rentMatch[1]) * 1000,
    location: locationMatch ? locationMatch[1] : "",
    raw: text.trim(),
  };
}

// ================= DUPLICATE HANDLING =================

const cache = new Set();

function isDuplicate(data) {
  const key = `${data.bhk}-${data.rent}-${data.location}`;

  if (cache.has(key)) {
    console.log("⚠️ Skipped duplicate-like listing");
    console.log("DATA:", data.raw);
    return true;
  }

  cache.add(key);

  // Auto clear after 5 mins
  setTimeout(() => cache.delete(key), 5 * 60 * 1000);

  return false;
}

// ================= PUSH TO SHEET =================

async function pushToSheet(data) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            new Date().toLocaleString(),
            data.bhk,
            data.rent,
            data.location,
            data.raw,
          ],
        ],
      },
    });

    console.log("✅ Added:", data.raw);
  } catch (err) {
    console.error("❌ Sheet Error:", err.message);
  }
}

// ================= CORE WEBHOOK =================

app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;

    if (!message) return res.sendStatus(200);

    console.log("📩 Incoming FULL MESSAGE:\n", message);

    // ✅ 1. Try full message directly
    let data = parseListing(message);

    if (data && !isDuplicate(data)) {
      await pushToSheet(data);
      return res.sendStatus(200);
    }

    // ✅ 2. Try smart line grouping
    const lines = message.split("\n");
    let buffer = "";

    for (let line of lines) {
      buffer += " " + line;

      const attempt = parseListing(buffer);

      if (attempt) {
        if (!isDuplicate(attempt)) {
          await pushToSheet(attempt);
        }
        buffer = "";
      }
    }

    if (buffer.trim()) {
      console.log("⚠️ Not enough data, skipping:", buffer.trim());
    }
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
  }

  res.sendStatus(200);
});

// ================= ROOT =================

app.get("/", (req, res) => {
  res.send("Server live");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
