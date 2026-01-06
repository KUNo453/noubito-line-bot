const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");

const app = express();

/* ===== env ===== */
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL;

/* ===== rawBody ===== */
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

/* ===== signature ===== */
function verifySignature(req) {
  const signature = req.headers["x-line-signature"];
  if (!signature) return false;

  const hash = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");

  return hash === signature;
}

/* ===== webhook ===== */
app.post("/webhook", async (req, res) => {
  // ★ LINE検証対策：何が来ても即200
  if (!req.headers["x-line-signature"]) {
    return res.status(200).send("OK");
  }

  // ★ 署名不正でも200（検証通すため）
  if (!verifySignature(req)) {
    return res.status(200).send("OK");
  }

  // ★ ここで即200返す（最重要）
  res.status(200).send("OK");

  // ↓ 以降は非同期でOK（失敗してもLINEは成功扱い）
  try {
    await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
  } catch (e) {
    console.error("GAS forward error", e);
  }
});

/* ===== start ===== */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
