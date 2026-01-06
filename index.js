/************************************************************
 * LINE Webhook 中継サーバー（Cloud Run）
 *
 * 役割：
 *  - LINE Webhook を即 200 OK で受ける（最重要）
 *  - rawBody を保持して署名検証を行う
 *  - 署名不正でも 200 を返す（LINE検証対策）
 *  - payload をそのまま GAS WebApp に転送
 *  - stdout に必ずログを出す（userId 確認用）
 ************************************************************/

const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");

const app = express();

/* =========================================================
 * 環境変数
 * ======================================================= */
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const GAS_WEBAPP_URL      = process.env.GAS_WEBAPP_URL;

/* =========================================================
 * rawBody を保持（署名検証用）
 * ======================================================= */
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

/* =========================================================
 * LINE署名検証
 * ======================================================= */
function verifySignature(req) {
  const signature = req.headers["x-line-signature"];
  if (!signature) return false;
  if (!LINE_CHANNEL_SECRET) return false;

  const hash = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");

  return hash === signature;
}

/* =========================================================
 * Webhook エンドポイント
 * ======================================================= */
app.post("/webhook", async (req, res) => {

  /* ===== ① まず即 200 OK を返す（LINE最優先） ===== */
  res.status(200).send("OK");

  /* ===== ② 必ず stdout にログを出す（userId確認用） ===== */
  try {
    console.log("===== LINE WEBHOOK RECEIVED =====");
    console.log(JSON.stringify(req.body, null, 2));
  } catch (e) {
    console.error("LOG ERROR:", e);
  }

  /* ===== ③ 署名チェック（不正でも止めない） ===== */
  try {
    if (!verifySignature(req)) {
      console.warn("⚠ Invalid or missing LINE signature");
      // 検証用なので return で終了（200は返済済み）
      return;
    }
  } catch (e) {
    console.error("SIGNATURE CHECK ERROR:", e);
    return;
  }

  /* ===== ④ GAS WebApp に payload をそのまま転送 ===== */
  try {
    if (!GAS_WEBAPP_URL) {
      console.error("❌ GAS_WEBAPP_URL is not set");
      return;
    }

    await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    console.log("✅ Forwarded payload to GAS");

  } catch (err) {
    console.error("❌ Forward to GAS failed:", err);
  }
});

/* =========================================================
 * サーバー起動
 * ======================================================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
