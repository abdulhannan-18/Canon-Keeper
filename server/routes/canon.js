const express = require("express");
const model   = require("../lib/modelAdapter");
const db      = require("../db");

const router = express.Router();

const MAX_QUESTION_LENGTH = 500;

// GET /api/canon — all known facts and all flagged contradictions
router.get("/", (_req, res) => {
  try {
    res.json({
      facts:          db.listAllFacts(),
      contradictions: db.listContradictions(),
    });
  } catch (err) {
    console.error("GET /api/canon:", err.message);
    res.status(500).json({ error: "Could not load canon data." });
  }
});

// POST /api/canon/ask — ask a question about the story's established facts
router.post("/ask", async (req, res) => {
  const { question } = req.body || {};

  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question is required and must be a non-empty string." });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return res.status(400).json({ error: `question exceeds the ${MAX_QUESTION_LENGTH} character limit.` });
  }

  try {
    const canonFacts = db.listAllFacts();
    const answer     = await model.answerQuestion(question.trim(), canonFacts);
    res.json({ answer });
  } catch (err) {
    console.error("POST /api/canon/ask:", err.message);
    res.status(502).json({
      error: "AI processing failed. Check server logs and your MODEL_PROVIDER configuration.",
    });
  }
});

module.exports = router;
