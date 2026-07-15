// ═══════════════════════════════════════════════════════════════
// Canon Keeper — SQLite storage layer
// One file, no ORM. Easy to inspect, back up, and explain.
// ═══════════════════════════════════════════════════════════════

const path    = require("path");
const fs      = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "canon.db"));

// WAL mode: better concurrent read performance for typical usage.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS chapters (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_number INTEGER NOT NULL UNIQUE,
    content        TEXT    NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS canon_facts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_name    TEXT    NOT NULL,
    fact_type      TEXT    NOT NULL CHECK (fact_type IN ('character','location','timeline','object')),
    attribute      TEXT    NOT NULL,
    value          TEXT    NOT NULL,
    source_chapter INTEGER NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contradictions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id     INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    entity_name    TEXT    NOT NULL,
    description    TEXT    NOT NULL,
    existing_value TEXT,
    new_value      TEXT,
    suggested_fix  TEXT,
    resolved       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_facts_entity   ON canon_facts(entity_name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_facts_type     ON canon_facts(fact_type);
  CREATE INDEX IF NOT EXISTS idx_chapters_num   ON chapters(chapter_number);
`);

// ── Chapters ───────────────────────────────────────────────────────
const _insertChapter = db.prepare(
  "INSERT INTO chapters (chapter_number, content) VALUES (?, ?) ON CONFLICT(chapter_number) DO UPDATE SET content=excluded.content, created_at=datetime('now')"
);

function upsertChapter(chapterNumber, content) {
  const info = _insertChapter.run(chapterNumber, content);
  // Return the id whether it was an insert or update
  if (info.lastInsertRowid) return info.lastInsertRowid;
  return db.prepare("SELECT id FROM chapters WHERE chapter_number = ?").get(chapterNumber).id;
}

function listChapters() {
  return db
    .prepare(
      "SELECT id, chapter_number, created_at, substr(content, 1, 140) AS preview FROM chapters ORDER BY chapter_number ASC"
    )
    .all();
}

function getChapterById(id) {
  return db.prepare("SELECT * FROM chapters WHERE id = ?").get(id);
}

function chapterExists(chapterNumber) {
  return !!db.prepare("SELECT 1 FROM chapters WHERE chapter_number = ?").get(chapterNumber);
}

// ── Canon facts ────────────────────────────────────────────────────
const _insertFact = db.prepare(`
  INSERT INTO canon_facts (entity_name, fact_type, attribute, value, source_chapter)
  VALUES (@entity_name, @fact_type, @attribute, @value, @source_chapter)
`);

function insertFacts(facts) {
  const tx = db.transaction((items) => {
    for (const f of items) _insertFact.run(f);
  });
  tx(facts);
}

function listAllFacts() {
  return db
    .prepare("SELECT * FROM canon_facts ORDER BY entity_name COLLATE NOCASE, attribute")
    .all();
}

function getFactsForEntities(entityNames) {
  if (!entityNames.length) return [];
  const placeholders = entityNames.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT * FROM canon_facts WHERE entity_name COLLATE NOCASE IN (${placeholders})`
    )
    .all(...entityNames);
}

// Delete all facts from a chapter (used when re-saving the same chapter number)
function deleteFactsForChapter(chapterNumber) {
  db.prepare("DELETE FROM canon_facts WHERE source_chapter = ?").run(chapterNumber);
}

// Delete contradictions whose chapter_id matches a chapter number
function deleteContradictionsForChapter(chapterId) {
  db.prepare("DELETE FROM contradictions WHERE chapter_id = ?").run(chapterId);
}

// ── Contradictions ─────────────────────────────────────────────────
const _insertContradiction = db.prepare(`
  INSERT INTO contradictions (chapter_id, entity_name, description, existing_value, new_value, suggested_fix)
  VALUES (@chapter_id, @entity_name, @description, @existing_value, @new_value, @suggested_fix)
`);

function insertContradictions(chapterId, contradictions) {
  const tx = db.transaction((items) => {
    for (const c of items) _insertContradiction.run({ chapter_id: chapterId, ...c });
  });
  tx(contradictions);
}

function listContradictions() {
  return db
    .prepare(
      `SELECT contradictions.*, chapters.chapter_number
       FROM contradictions
       JOIN chapters ON chapters.id = contradictions.chapter_id
       ORDER BY contradictions.created_at DESC`
    )
    .all();
}

module.exports = {
  db,
  upsertChapter,
  listChapters,
  getChapterById,
  chapterExists,
  insertFacts,
  listAllFacts,
  getFactsForEntities,
  deleteFactsForChapter,
  deleteContradictionsForChapter,
  insertContradictions,
  listContradictions,
};
