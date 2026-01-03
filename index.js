const express = require("express");
const app = express();

app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("=== WEBHOOK HIT ===");
  console.log(JSON.stringify(req.body, null, 2));
  res.status(200).send("OK");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

