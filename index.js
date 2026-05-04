```javascript
const express = require("express");
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = "easyfind123";

// ==============================
// 🧠 MEMORY (TEMP STORAGE)
// ==============================

let currentListing = null;
let lastMessageTime = null;

// ==============================
// 🔧 HELPERS
// ==============================

function isListingStart(text) {
  if (!text) return false;

  const t = text.toLowerCase();

  return (
    t.includes("bhk") &&
    (t.includes("rent") || t.includes("₹") || t.includes("k"))
  );
}

function isSeparator(text) {
  if (!text) return false;

  return (
    text.includes("-----") ||
    text.includes("___") ||
    text.includes("***") ||
    text.includes("——")
  );
}

function isNoise(text) {
  if (!text) return true;

  const t = text.trim().toLowerCase();

  if (t.length < 8) return true;

  const noiseWords = ["ok", "okay", "available?", "yes", "no", ".", "👍"];

  return noiseWords.includes(t);
}

function isMapLink(text) {
  if (!text) return false;

  return (
    text.includes("maps.google.com") ||
    text.includes("maps.app.goo.gl")
  );
}

function extractLocationFromMap(link) {
  try {
    const decoded = decodeURIComponent(link);
    return decoded.split("?q=")[1] || decoded;
  } catch {
    return link;
  }
}

function finalizeListing() {
  if (!currentListing) return;

  console.log("✅ FINAL LISTING:", currentListing);

  // 👉 NEXT STEP: Send to Google Sheets API (we will plug later)

  currentListing = null;
}

// ==============================
// ✅ VERIFY WEBHOOK
// ==============================

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

// ==============================
// 📩 RECEIVE WHATSAPP
// ==============================

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    const message =
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const text = message?.text?.body || "";
    const from = message?.from;

    console.log("📩:", text);

    const now = Date.now();

    // ============================
    // ⏱ AUTO CLOSE (TIMEOUT)
    // ============================

    if (lastMessageTime && now - lastMessageTime > 30000) {
      finalizeListing();
    }

    lastMessageTime = now;

    // ============================
    // 🔴 SEPARATOR (STRONG CLOSE)
    // ============================

    if (isSeparator(text)) {
      finalizeListing();
      return res.sendStatus(200);
    }

    // ============================
    // 🟢 NEW LISTING START
    // ============================

    if (isListingStart(text)) {
      finalizeListing();

      currentListing = {
        text: text,
        images: [],
        location: "",
        rawMessages: [text],
        from: from
      };

      return res.sendStatus(200);
    }

    // ============================
    // 🟡 ATTACH TO CURRENT LISTING
    // ============================

    if (!currentListing) {
      return res.sendStatus(200);
    }

    // Ignore noise
    if (isNoise(text)) {
      return res.sendStatus(200);
    }

    // Map link
    if (isMapLink(text)) {
      currentListing.location = extractLocationFromMap(text);
      currentListing.rawMessages.push(text);
      return res.sendStatus(200);
    }

    // Normal text continuation
    if (text) {
      currentListing.text += "\n" + text;
      currentListing.rawMessages.push(text);
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```
