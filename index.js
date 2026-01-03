const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");

const app = express();

/* ===== 環境変数 ===== */
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL;

/* ===== rawBody を保持（LINE署名検証用） ===== */
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

/* ===== LINE署名検証 ===== */
function verifySignature(req) {
  const signature = req.headers["x-line-signature"];
  if (!signature) return false;

  const hash = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");

  return hash === signature;
}

/* ===== GASへ転送 ===== */
async function forwardToGAS(payload) {
  await fetch(GAS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/* ===== Webhook ===== */
app.post("/webhook", async (req, res) => {
  try {
    if (!verifySignature(req)) {
      console.error("Invalid LINE signature");
      return res.status(401).send("Invalid signature");
    }

    console.log("=== LINE WEBHOOK HIT ===");
    console.log(JSON.stringify(req.body, null, 2));

    await forwardToGAS(req.body);

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Internal Server Error");
  }
});

/* ===== Cloud Run 起動 ===== */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
