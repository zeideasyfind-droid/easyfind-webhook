const express = require("express");
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// ✅ VERIFY WEBHOOK (META REQUIREMENT)
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "easyfind123"; // set this in Meta

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// ✅ RECEIVE WHATSAPP MESSAGE
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log("FULL PAYLOAD:", JSON.stringify(body, null, 2));

    const message =
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const text = message?.text?.body;
    const from = message?.from;

    console.log("📩 Incoming Message:", text);
    console.log("📱 From:", from);

    res.sendStatus(200);

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
