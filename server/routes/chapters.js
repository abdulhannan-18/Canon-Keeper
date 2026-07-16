const express = require("express");
const model   = require("../lib/modelAdapter");
const db      = require("../db");

const router = express.Router();

const MAX_CHAPTER_LENGTH = 20_000; // chars — generous for a full chapter

// DELETE /api/chapters/:id — delete a chapter and all its facts/contradictions
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid chapter id." });
  }
  try {
    const chapter = db.getChapterById(id);
    if (!chapter) return res.status(404).json({ error: "Chapter not found." });
    db.deleteFactsForChapter(chapter.chapter_number);
    db.deleteContradictionsForChapter(id);
    db.db.prepare("DELETE FROM chapters WHERE id = ?").run(id);
    res.json({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/chapters/:id:", err.message);
    res.status(500).json({ error: "Could not delete chapter." });
  }
});

// GET /api/chapters — list saved chapters (previews only, no full content)
router.get("/", (_req, res) => {
  try {
    res.json({ chapters: db.listChapters() });
  } catch (err) {
    console.error("GET /api/chapters:", err.message);
    res.status(500).json({ error: "Could not load chapters." });
  }
});

// POST /api/chapters — save/update a chapter, extract facts, check contradictions
router.post("/", async (req, res) => {
  const { chapterNumber, text } = req.body || {};

  // Input validation
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text is required and must be a non-empty string." });
  }
  if (text.length > MAX_CHAPTER_LENGTH) {
    return res.status(400).json({ error: `text exceeds the ${MAX_CHAPTER_LENGTH.toLocaleString()} character limit.` });
  }
  const chNum = Number(chapterNumber);
  if (!Number.isInteger(chNum) || chNum < 1 || chNum > 9999) {
    return res.status(400).json({ error: "chapterNumber must be a positive integer (1–9999)." });
  }

  try {
    // Upsert chapter (handles re-saves of the same chapter number gracefully)
    const chapterId = db.upsertChapter(chNum, text.trim());

    // Remove old facts and contradictions for this chapter before re-extracting
    // This prevents duplicates when a chapter is re-saved.
    db.deleteFactsForChapter(chNum);
    db.deleteContradictionsForChapter(chapterId);

    // Extract facts from the new chapter text
    const newFacts = await model.extractFacts(text.trim(), chNum);

    // Get existing facts for the same entities (from OTHER chapters)
    const entityNames  = [...new Set(newFacts.map(f => f.entity_name))];
    const existingFacts = db.getFactsForEntities(entityNames).filter(f => f.source_chapter !== chNum);

    // Check for contradictions against existing canon
    const contradictions = await model.checkContradictions(newFacts, existingFacts);

    // Persist
    if (newFacts.length)       db.insertFacts(newFacts);
    if (contradictions.length) db.insertContradictions(chapterId, contradictions);

    res.status(201).json({
      chapterId,
      factsExtracted: newFacts,
      contradictions,
    });
  } catch (err) {
    console.error("POST /api/chapters:", err.message);
    res.status(502).json({
      error: "AI processing failed. Check server logs. Is MODEL_PROVIDER configured correctly in .env?",
    });
  }
});

module.exports = router;
