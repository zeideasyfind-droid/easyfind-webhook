const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");

const app = express();

// ✅ ADD THIS LINE (VERY IMPORTANT)
app.use(cors());

app.use(express.json());

// 🔑 Load service account from ENV
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

// 📄 Your Google Sheet ID
const SHEET_ID = "1BbuD7HbL6Hct3VbAaomx890wKsvVUvtIb4j8QJ7SFo4";

// 🔐 Auth setup
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ✅ Root check
app.get("/", (req, res) => {
  res.send("EasyFind Webhook is LIVE 🚀");
});

// 🔥 Webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    console.log("Incoming data:", req.body);

    const { name, phone, message } = req.body;

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Live Tracking!A:D", // ✅ FIXED
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            name || "",
            phone || "",
            message || "",
            new Date().toLocaleString(),
          ],
        ],
      },
    });

    res.status(200).send("Data added to sheet ✅");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error writing to sheet ❌");
  }
});

// 🚀 Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
