import "dotenv/config";
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.js";

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";

app.use(
  cors({
    origin: FRONTEND_URL === "*" ? "*" : FRONTEND_URL.split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

app.use("/api/health", healthRouter);

// 404 handler
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[ml-cms-api] listening on port ${PORT}`);
});
