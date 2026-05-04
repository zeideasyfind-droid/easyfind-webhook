const express = require("express");
const app = express();

app.use(express.json());

// VERIFY WEBHOOK (GET)
app.get("/", (req, res) => {
  const VERIFY_TOKEN = "mytoken123";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// RECEIVE MESSAGES (POST)
app.post("/", (req, res) => {
  console.log("Incoming message:");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
