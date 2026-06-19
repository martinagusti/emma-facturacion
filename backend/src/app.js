const path = require("path");
const express = require("express");
const { env } = require("./config/env");
const { apiRouter } = require("./routes/api");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use("/api", apiRouter);
app.use(express.static(env.frontendDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(env.frontendDir, "index.html"));
});

module.exports = { app };
