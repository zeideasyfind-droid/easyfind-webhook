const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = "easyfind123";

// ================= GOOGLE SHEETS =================
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const SHEET_ID = process.env.SHEET_ID;

// ================= MEMORY =================
let lastListingSignature = null;
let counter = 1;

// ================= HELPERS =================
function hasMinimumData(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return t.includes("bhk") && (t.includes("rent") || t.includes("₹") || t.includes("k"));
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
    pets: lower.includes("not allowed")
      ? "No"
      : lower.includes("allowed")
      ? "Yes"
      : "",
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

  const num = String(counter).padStart(3, "0");
  counter++;

  return `EF-${dd}${mm}${yy}-${num}`;
}

// 🔥 KEY PART → detect new listing smartly
function getListingSignature(details) {
  return `${details.bhk}-${details.rent}`;
}

// ================= SHEET PUSH =================
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

  console.log("✅ Added:", data.pid);
}

// ================= WEBHOOK VERIFY =================
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

// ================= MAIN =================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    const message =
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const text = message?.text?.body || "";
    const msgId = message.id;
    const from = message.from;
    const timestamp = message.timestamp;

    console.log("📩 Incoming:", text);

    // break loosely (not strict)
    const chunks = text.split(/[-_]{3,}|[*]{3,}|—+/);

    for (let chunk of chunks) {
      const clean = chunk.trim();
      if (!clean) continue;

      if (!hasMinimumData(clean)) continue;

      const details = extractDetails(clean);
      const signature = getListingSignature(details);

      // 🔥 smart duplicate / new detection
      if (signature !== lastListingSignature) {
        lastListingSignature = signature;

        const pid = generatePID();

        await pushToSheet(
          { ...details, pid },
          clean,
          msgId,
          from,
          timestamp
        );
      } else {
        console.log("⚠️ Skipped duplicate-like listing");
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("ERROR:", err);
    res.sendStatus(500);
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
