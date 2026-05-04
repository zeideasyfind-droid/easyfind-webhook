const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ================= CONFIG =================

// ✅ YOUR ACTUAL SHEET ID (CONFIRMED)
const SPREADSHEET_ID = "1BbuD7HbL6Hct3VbAaomx890wKsvVUvtIb4j8QJ7SFo4";

// ✅ EXACT TAB NAME FROM YOUR SCREENSHOT
const SHEET_NAME = "Live Tracking";

// ================= GOOGLE AUTH =================

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ================= HELPERS =================

function extractData(text) {
  if (!text) return null;

  const lower = text.toLowerCase();

  const bhkMatch = lower.match(/(\d)\s*bhk/);
  const rentMatch = lower.match(/(\d+)\s*k/);
  const locationMatch = lower.match(
    /(harlur|bellandur|hsr|sarjapur|marathahalli|whitefield)/
  );

  if (!bhkMatch || !rentMatch) return null;

  return {
    bhk: bhkMatch[1] + " BHK",
    rent: parseInt(rentMatch[1]) * 1000,
    location: locationMatch ? locationMatch[1] : "",
    raw: text.trim(),
  };
}

// ================= DUPLICATE CHECK =================

const recentCache = new Set();

function isDuplicate(data) {
  const key = `${data.bhk}-${data.rent}-${data.location}`;

  if (recentCache.has(key)) {
    console.log("⚠️ Skipped duplicate-like listing");
    console.log("DATA:", data.raw);
    return true;
  }

  recentCache.add(key);

  setTimeout(() => {
    recentCache.delete(key);
  }, 5 * 60 * 1000);

  return false;
}

// ================= SHEET PUSH =================

async function pushToSheet(data) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`, // ✅ FIXED
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

    console.log("✅ Added to sheet");
  } catch (err) {
    console.error("❌ Sheet Error:", err.message);
  }
}

// ================= WEBHOOK =================

app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;

    if (!message) {
      console.log("⚠️ No message body");
      return res.sendStatus(200);
    }

    console.log("📩 Incoming:", message);

    // Handle multiple lines / listings
    const parts = message.split("\n");

    for (let part of parts) {
      const data = extractData(part);

      if (!data) {
        console.log("⚠️ Not enough data, skipping");
        continue;
      }

      if (isDuplicate(data)) continue;

      await pushToSheet(data);
    }
  } catch (err) {
    console.error("Webhook Error:", err.message);
  }

  res.sendStatus(200);
});

// ================= HEALTH CHECK =================

app.get("/", (req, res) => {
  res.send("Server is live");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
