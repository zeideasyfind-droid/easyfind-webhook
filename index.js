const express = require("express");
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = "easyfind123";

// ================================
// ✅ WEBHOOK VERIFICATION (META)
// ================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🔍 Webhook verification request received");

  if (mode && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully");
    return res.status(200).send(challenge);
  } else {
    console.log("❌ Verification failed");
    return res.sendStatus(403);
  }
});

// ================================
// ✅ RECEIVE WHATSAPP MESSAGES
// ================================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log("📦 FULL PAYLOAD:");
    console.log(JSON.stringify(body, null, 2));

    // WhatsApp message object
    const message =
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      console.log("⚠️ No message object found");
      return res.sendStatus(200);
    }

    const text = message?.text?.body || "";
    const from = message?.from || "";
    const messageId = message?.id || "";

    console.log("📩 Message:", text);
    console.log("📱 From:", from);
    console.log("🆔 Message ID:", messageId);

    // OPTIONAL: detect message type
    const type = message?.type;
    console.log("📌 Type:", type);

    res.sendStatus(200);

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.sendStatus(500);
  }
});

// ================================
// ✅ SERVER START
// ================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
