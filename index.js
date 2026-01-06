/************************************************************
 * LINE Webhook 中継サーバー（Cloud Run）
 * 役割：
 *  - LINE Webhook を即 200 OK で受ける
 *  - 署名検証は行う（ただし失敗でも 200）
 *  - payload をそのまま GAS WebApp に転送
 ************************************************************/

const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");

const app = express();

/* ===== 環境変数 ===== */
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL;

/* ===== rawBody を保持（署名検証用） ===== */
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

/* ===== Webhook ===== */
app.post("/webhook", async (req, res) => {
  // ===== ① 何が来ても即 200 OK（最重要） =====
  res.status(200).send("OK");

  // ===== ② ログ（userId確認用） =====
  try {
    console.log("=== LINE WEBHOOK BODY ===");
    console.log(JSON.stringify(req.body, null, 2));
  } catch (_) {}

  // ===== ③ 署名が無い／不正でも処理は止めない =====
  try {
    if (!verifySignature(req)) {
      console.warn("Invalid or missing LINE signature");
      return;
    }

    // ===== ④ GAS に payload をそのまま転送 =====
    await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

  } catch (err) {
    console.error("Forward to GAS failed:", err);
  }
});

/* ===== サーバー起動 ===== */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
