const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");

const app = express();
app.use(bodyParser.json());

// ✅ Root route (this fixes your issue)
app.get("/", (req, res) => {
  res.send("EasyFind Webhook is LIVE 🚀");
});

// 🔐 Google Sheets setup
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const SHEET_ID = "YOUR_GOOGLE_SHEET_ID"; // we will update this next

// 📩 Webhook route
app.post("/webhook", async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const data = req.body;

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          data.name || "",
          data.phone || "",
          data.message || "",
          new Date().toLocaleString()
        ]],
      },
    });

    res.status(200).send("Data added to sheet");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error");
  }
});

// 🚀 Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
