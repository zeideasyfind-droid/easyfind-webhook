// ==============================
// VERSION P7.6
// Changes:
// 1. ADD: Proper WhatsApp API response logging
// 2. FIX: Added "type":"text" in WhatsApp send payload
// 3. SAFE: No inventory automation logic touched
// 4. SAFE: No parser / sheet / webhook flow changes
// ==============================

// ===== P7.5 ADD: WHATSAPP SEND MESSAGE FUNCTION =====
// ===== P7.6 FIX: ADDED RESPONSE LOGGING + TYPE =====
async function sendWhatsAppMessage(to, message) {
try {

const response = await fetch(
  `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",

      // ===== P7.6 FIX =====
      type: "text",

      to,

      text: {
        body: message,
      },
    }),
  }
);

// ===== P7.6 ADD: FULL META RESPONSE LOGGING =====
const result = await response.json();

log("WHATSAPP API RESPONSE", result);

log("WHATSAPP REPLY SENT", to);

} catch (err) {
log("WHATSAPP SEND ERROR", err.message);
}
}