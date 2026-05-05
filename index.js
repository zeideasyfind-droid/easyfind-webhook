// ==============================
// VERSION P7.3.1
// Changes:
// 1. FIX: Google Drive upload crash (ArrayBuffer → Buffer conversion)
// 2. SAFE: No change to parser / webhook / sheet / structure
// ==============================

const express = require("express");
const { google } = require("googleapis");
const crypto = require("crypto");
const fetch = require("node-fetch");

// ===== P7.3 ADD =====
const { Readable } = require("stream");

const cloudinary = require("cloudinary").v2;

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const SPREADSHEET_ID = "1BbuD7HbL6Hct3VbAaomx890wKsvVUvtIb4j8QJ7SFo4";
const SHEET_NAME = "Live Tracking";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
  ],
});

const sheets = google.sheets({ version: "v4", auth });

// ===== P7.3 ADD =====
const drive = google.drive({ version: "v3", auth });

// ⚠️ PUT YOUR FOLDER ID HERE
const DRIVE_FOLDER_ID = "PASTE_YOUR_FOLDER_ID_HERE";

const buffers = {};

// ===== LOGGER =====
function log(title, data = "") {
  console.log(`\n========== ${title} ==========`);

  if (typeof data === "object") {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

// ===== CLEAN =====
function cleanText(text) {
  return (text || "").replace(/\*/g, "").replace(/[:]/g, "").trim();
}

// ===== NORMALIZE =====
function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
}

// ===== MONEY =====
function parseMoney(text) {
  if (!text) return "";

  const match = text.match(/₹?\s*([\d,.]+)\s*(k|l|lakhs?)?/i);
  if (!match) return "";

  let val = Number(match[1].replace(/,/g, ""));
  const unit = match[2]?.toLowerCase();

  if (unit === "k") val *= 1000;
  else if (unit === "l" || unit?.includes("lakh")) val *= 100000;

  return val;
}

// ===== CLOUDINARY (UNUSED) =====
async function uploadBufferToCloudinary(buffer) {
  try {
    const base64 = Buffer.from(buffer).toString("base64");

    const result = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${base64}`,
      { folder: "easyfind_properties" }
    );

    return result.secure_url;
  } catch (err) {
    log("CLOUDINARY ERROR", err.message);
    return "";
  }
}

// ===== GOOGLE DRIVE UPLOAD =====
async function uploadToDrive(buffer) {
  try {
    const stream = Readable.from(buffer);

    const res = await drive.files.create({
      requestBody: {
        name: `property_${Date.now()}.jpg`,
        parents: [DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: "image/jpeg",
        body: stream,
      },
      fields: "id",
    });

    const fileId = res.data.id;

    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    return `https://drive.google.com/uc?id=${fileId}`;

  } catch (err) {
    log("DRIVE ERROR", err.message);
    return "";
  }
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const msgObj = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    const message = msgObj?.text?.body || "";
    const sender = msgObj?.from;
    const messageId = msgObj?.id;

    if (!sender) return res.sendStatus(200);

    let imageUrl = "";

    if (msgObj?.image?.id) {
      try {
        const mediaRes = await fetch(
          `https://graph.facebook.com/v18.0/${msgObj.image.id}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            },
          }
        );

        const mediaData = await mediaRes.json();

        const imageResponse = await fetch(mediaData.url, {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          },
        });

        if (!imageResponse.ok) {
          throw new Error("Failed to fetch image");
        }

        // ===== FIXED LINE =====
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

        imageUrl = await uploadToDrive(imageBuffer);

      } catch (err) {
        log("IMAGE ERROR", err.message);
      }
    }

    buffers[sender] = {
      text: message,
      sender,
      messageId,
      imageUrl,
      timer: null
    };

    buffers[sender].timer = setTimeout(() => {
      processBuffer(sender);
    }, 30000);

    if (message.includes("maps.app.goo.gl")) {
      await processBuffer(sender);
    }

  } catch (err) {
    log("ERROR", err.message);
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Webhook is live ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Running on ${PORT}`);
});