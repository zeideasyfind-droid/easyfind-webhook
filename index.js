const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = "easyfind123";

// ================================
// 🔑 GOOGLE SHEETS SETUP
// ================================
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const SHEET_ID = process.env.SHEET_ID;

// ================================
// 🧠 TEMP MEMORY
// ================================
let currentListing = {
  text: "",
  images: [],
  mapLink: "",
};

let listingCounter = 1;

// ================================
// 🔍 HELPERS
// ================================
function isSeparator(text) {
  if (!text) return false;
  return (
    text.includes("----") ||
    text.includes("___") ||
    text.includes("***") ||
    text.includes("—")
  );
}

function extractDetails(text) {
  const lower = text.toLowerCase();

  return {
    bhk: (text.match(/\d+\s*bhk/i) || [""])[0],
    rent: (text.match(/rent[:\s]*([\d.]+k?)/i) || ["", ""])[1],
    maintenance: (text.match(/maintenance[:\s]*([\d.]+k?)/i) || ["", ""])[1],
    deposit: (text.match(/deposit[:\s]*([\d.]+l?k?)/i) || ["", ""])[1],
    size: (text.match(/sqft[:\s]*(\d+)/i) || ["", ""])[1],
    floor: (text.match(/floor[:\s]*([\d/]+)/i) || ["", ""])[1],
    furnishing: lower.includes("semi")
      ? "Semi Furnished"
      : lower.includes("fully")
      ? "Fully Furnished"
      : lower.includes("partial")
      ? "Partially Furnished"
      : "",
    pets: lower.includes("not allowed") ? "No" : lower.includes("allowed") ? "Yes" : "",
    availability: lower.includes("immediate") || lower.includes("ready")
      ? "Immediate"
      : "",
    location: (text.match(/near\s(.+)/i) || ["", ""])[1],
  };
}

function generatePID() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);

  const counter = String(listingCounter).padStart(3, "0");
  listingCounter++;

  return `EF-${dd}${mm}${yy}-${counter}`;
}

// ================================
// 📤 PUSH TO GOOGLE SHEETS
// ================================
async function pushToSheet(data, raw, msgId, phone, timestamp) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const now = new Date().toLocaleString();

  const row = [
    data.pid,
    "Online",
    data.location,
    "Gated",
    "",
    data.bhk,
    "",
    "",
    "",
    data.size,
    data.floor,
    data.furnishing,
    "",
    "",
    data.pets,
    data.rent,
    data.maintenance,
    data.deposit,
    data.availability,
    "",
    "",
    data.availability,
    now,
    now,
    msgId,
    phone,
    raw,
    timestamp,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Live Tracking!A:AB",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row],
    },
  });

  console.log("✅ Added to sheet:", data.pid);
}

// ================================
// 🔄 FINALIZE LISTING
// ================================
async function finalizeListing(msgId, phone, timestamp) {
  if (!currentListing.text && !currentListing.mapLink) return;

  const details = extractDetails(currentListing.text);
  const pid = generatePID();

  await pushToSheet(
    { ...details, pid },
    JSON.stringify(currentListing),
    msgId,
    phone,
    timestamp
  );

  currentListing = { text: "", images: [], mapLink: "" };
}

// ================================
// 🔐 VERIFY WEBHOOK
// ================================
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

// ================================
// 📥 RECEIVE WHATSAPP
// ================================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log("FULL PAYLOAD:", JSON.stringify(body, null, 2));

    const message =
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const msgId = message.id;
    const from = message.from;
    const timestamp = message.timestamp;

    if (message.type === "text") {
      const text = message.text.body;

      if (isSeparator(text)) {
        await finalizeListing(msgId, from, timestamp);
      } else {
        currentListing.text += "\n" + text;
      }
    }

    if (message.type === "image") {
      currentListing.images.push(message.image.id);
    }

    if (message.type === "location") {
      currentListing.mapLink = `https://maps.google.com/?q=${message.location.latitude},${message.location.longitude}`;
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("ERROR:", err);
    res.sendStatus(500);
  }
});

// ================================
// 🚀 START SERVER
// ================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
