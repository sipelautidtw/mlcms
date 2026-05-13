import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", async (req, res) => {
  let dbStatus = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch (err) {
    dbStatus = "error: " + err.message;
  }

  res.json({
    status: "ok",
    service: "ml-cms-api",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

export default router;
