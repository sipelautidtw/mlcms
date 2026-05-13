import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, inspectBrandBrief, loadBrandBrief } from "../lib/brand-prompt.js";

const router = Router();

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS || "2048", 10);

let anthropic = null;
function getClient() {
  if (anthropic) return anthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.startsWith("sk-ant-...") || key.length < 20) {
    return null;
  }
  anthropic = new Anthropic({ apiKey: key });
  return anthropic;
}

/**
 * POST /api/chat
 * Body: { message: string, history?: [{role: 'user'|'assistant', content: string}] }
 * Response: { reply, usage, model }
 */
router.post("/", async (req, res, next) => {
  try {
    const { message, history = [] } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Field 'message' (string non-empty) wajib diisi." });
    }

    const client = getClient();
    if (!client) {
      return res.status(503).json({
        error: "ANTHROPIC_API_KEY belum dikonfigurasi di .env. Hubungi administrator untuk setup.",
      });
    }

    // Validasi history format
    const validHistory = Array.isArray(history)
      ? history.filter(
          (m) =>
            m &&
            typeof m === "object" &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
      : [];

    const systemPrompt = buildSystemPrompt();

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [...validHistory, { role: "user", content: message.trim() }],
    });

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    res.json({
      reply,
      usage: response.usage,
      model: response.model,
      stop_reason: response.stop_reason,
    });
  } catch (err) {
    // Anthropic error handling
    if (err.status) {
      return res.status(err.status).json({
        error: err.message || "Error dari Anthropic API",
        type: err.type || "anthropic_error",
      });
    }
    next(err);
  }
});

/**
 * GET /api/chat/inspect
 * Cek struktur Brand Brief yang sedang di-load. Berguna untuk verifikasi setelah update YAML.
 */
router.get("/inspect", (req, res, next) => {
  try {
    res.json(inspectBrandBrief());
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/chat/reload
 * Force reload Brand Brief dari disk (bypass cache).
 */
router.post("/reload", (req, res, next) => {
  try {
    loadBrandBrief({ forceReload: true });
    res.json({ status: "ok", message: "Brand Brief reloaded.", ...inspectBrandBrief() });
  } catch (err) {
    next(err);
  }
});

export default router;
