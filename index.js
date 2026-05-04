const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// ===== CONFIG =====
const VERIFY_TOKEN = "easyfind_verify_token";
const SPREADSHEET_ID = "1BbuD7HbL6Hct3VbAaomx890wKsvVUvtIb4j8QJ7SFo4";
const SHEET_NAME = "Live Tracking";

// ===== GOOGLE AUTH =====
const auth = new google.auth.GoogleAuth({
  credentials: require("./service-account.json"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ===== WEBHOOK VERIFICATION =====
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// ===== CHECK DUPLICATE MESSAGE ID =====
async function isDuplicate(messageId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!Y:Y`,
  });

  const rows = response.data.values || [];
  return rows.some(row => row[0] === messageId);
}

// ===== WEBHOOK RECEIVE =====
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (!body.entry) return res.sendStatus(200);

    const change = body.entry[0].changes[0].value;

    // Ignore read/delivery updates
    if (!change.messages) return res.sendStatus(200);

    const msg = change.messages[0];

    const messageId = msg.id;
    const sender = msg.from;
    const text = msg.text ? msg.text.body : "";
    const timestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString();

    console.log("Incoming message:", text);

    // Duplicate check
    const duplicate = await isDuplicate(messageId);
    if (duplicate) {
      console.log("Duplicate skipped");
      return res.sendStatus(200);
    }

    // Write to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!Y:AB`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[messageId, sender, text, timestamp]],
      },
    });

    console.log("Saved to sheet ✅");

    res.sendStatus(200);
  } catch (error) {
    console.error("Error:", error);
    res.sendStatus(500);
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
