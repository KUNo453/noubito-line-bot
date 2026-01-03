// index.js（Cloud Run / LINE Webhook 最小起動版）

const express = require("express");
const app = express();

app.use(express.json());

// ヘルスチェック（Cloud Run用）
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// LINE webhook（とりあえず200返す）
app.post("/webhook", (req, res) => {
  console.log("=== WEBHOOK HIT ===");
  console.log(JSON.stringify(req.body, null, 2));
  res.status(200).send("OK");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

