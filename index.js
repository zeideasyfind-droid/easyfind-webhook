const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = "easyfind123";

// ===============================
// GOOGLE SHEETS SETUP
// ===============================

const SHEET_ID = process.env.SHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ===============================
// MEMORY
// ===============================

let recentListings = [];

// ===============================
// HELPERS
// ===============================

function generateKey(listing) {
  return `${listing.bhk || ""}-${listing.rent || ""}-${listing.location || ""}`
    .toLowerCase()
    .trim();
}

function isDuplicate(listing, rawMessage) {
  const key = generateKey(listing);

  if (recentListings.includes(key)) {
    console.log("⚠️ Skipped duplicate-like listing");
    console.log("DATA:", rawMessage);
    return true;
  }

  return false;
}

function markAsSeen(listing) {
  const key = generateKey(listing);
  recentListings.push(key);

  if (recentListings.length > 50) {
    recentListings.shift();
  }
}

// ===============================
// PARSER (SMART + FLEXIBLE)
// ===============================

function parseMessage(text) {
  const lower = text.toLowerCase();

  const bhkMatch = text.match(/(\d+)\s*bhk/i);
  const rentMatch = text.match(/(?:rent[:\s]*)?(\d+)\s*k/i);
  const depositMatch = text.match(/(\d+(\.\d+)?)\s*l/i);
  const sqftMatch = text.match(/(\d{3,5})\s*sqft/i);
  const locationMatch = text.match(/location[:\s]*(.*)/i);

  return {
    bhk: bhkMatch ? `${bhkMatch[1]} BHK` : "",
    rent: rentMatch ? Number(rentMatch[1]) * 1000 : "",
    deposit: depositMatch ? Number(depositMatch[1]) * 100000 : "",
    sqft: sqftMatch ? sqftMatch[1] : "",
    location: locationMatch ? locationMatch[1].trim() : "",
  };
}

// ===============================
// PUSH TO SHEET
// ===============================

async function pushToSheet(listing, rawMessage, phone, messageId) {
  try {
    if (!SHEET_ID) {
      console.log("❌ SHEET_ID missing");
      return false;
    }

    const row = [
      `EF-${Date.now()}`, // PID
      "WhatsApp", // Source
      listing.location,
      listing.bhk,
      listing.rent,
      listing.deposit,
      listing.sqft,
      rawMessage,
      phone,
      messageId,
      new Date().toISOString(),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [row],
      },
    });

    console.log("✅ Added to sheet:", listing.bhk, listing.rent);
    return true;
  } catch (err) {
    console.log("❌ Sheet Error:", err.message);
    return false;
  }
}

// ===============================
// VERIFY WEBHOOK
// ===============================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// ===============================
// MAIN WEBHOOK
// ===============================

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    const message =
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const text = message?.text?.body || "";
    const from = message?.from || "";
    const messageId = message?.id || "";

    console.log("📩 Incoming:", text);

    const listing = parseMessage(text);

    // basic validation (smart, not strict)
    if (!listing.bhk && !listing.rent) {
      console.log("⚠️ Not enough data, skipping");
      return res.sendStatus(200);
    }

    if (!isDuplicate(listing, text)) {
      const success = await pushToSheet(
        listing,
        text,
        from,
        messageId
      );

      if (success) {
        markAsSeen(listing);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
