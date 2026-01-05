import express from "express";

const app = express();
app.use(express.json());

// LINE Webhook（即200 OK）
app.post("/", (req, res) => {
  res.status(200).send("OK");
});

// Cloud Run 起動
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
