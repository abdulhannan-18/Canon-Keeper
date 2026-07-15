// ═══════════════════════════════════════════════════════════════
// CANON KEEPER — Frontend Application
// Handles all UI interactions, API calls, state management.
// ═══════════════════════════════════════════════════════════════

const API = "/api";

// ── Element refs ────────────────────────────────────────────────
const els = {
  // Sidebar nav
  navItems:        document.querySelectorAll(".nav-item"),
  panels:          document.querySelectorAll(".panel"),
  contraCount:     document.getElementById("contra-count"),
  factsCount:      document.getElementById("facts-count"),
  providerLabel:   document.getElementById("provider-label"),
  providerDot:     document.querySelector(".provider-dot"),

  // Mobile
  hamburger:       document.getElementById("hamburger"),
  sidebar:         document.getElementById("sidebar"),

  // Write panel
  chapterNumber:   document.getElementById("chapter-number"),
  chapterText:     document.getElementById("chapter-text"),
  charCount:       document.getElementById("char-count"),
  saveBtn:         document.getElementById("save-btn"),
  clearBtn:        document.getElementById("clear-btn"),
  saveStatus:      document.getElementById("save-status"),
  duplicateWarning:document.getElementById("duplicate-warning"),
  duplicateMsg:    document.getElementById("duplicate-msg"),

  // Stats
  statChapters:    document.getElementById("stat-chapters"),
  statFacts:       document.getElementById("stat-facts"),
  statContradictions: document.getElementById("stat-contradictions"),

  // Contradictions panel
  contradictionsList: document.getElementById("contradictions-list"),
  refreshContraBtn:   document.getElementById("refresh-contra-btn"),

  // Facts panel
  factsList:       document.getElementById("facts-list"),
  filterBtns:      document.querySelectorAll(".filter-btn"),

  // Ask panel
  questionInput:   document.getElementById("question-input"),
  askBtn:          document.getElementById("ask-btn"),
  answerContainer: document.getElementById("answer-container"),
  answerBox:       document.getElementById("answer-box"),
  sqChips:         document.querySelectorAll(".sq-chip"),

  // Chapters panel
  chaptersList:    document.getElementById("chapters-list"),

  // Toast & loading
  toast:           document.getElementById("toast"),
  loadingOverlay:  document.getElementById("loading-overlay"),
  loadingTitle:    document.getElementById("loading-title"),
};

// ── App State ────────────────────────────────────────────────────
let state = {
  facts: [],
  contradictions: [],
  chapters: [],
  factFilter: "all",
  savedChapterNumbers: new Set(),
};

// ── Navigation ───────────────────────────────────────────────────
function switchPanel(panelId) {
  els.panels.forEach(p => p.classList.toggle("active", p.id === `panel-${panelId}`));
  els.navItems.forEach(n => n.classList.toggle("active", n.dataset.panel === panelId));
  closeMobileSidebar();
}

els.navItems.forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.panel;
    switchPanel(target);
    if (target === "chapters") loadChapters();
  });
});

// ── Mobile sidebar ───────────────────────────────────────────────
let overlay = null;

function openMobileSidebar() {
  els.sidebar.classList.add("open");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "sidebar-overlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", closeMobileSidebar);
  }
  overlay.classList.add("visible");
}

function closeMobileSidebar() {
  els.sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("visible");
}

els.hamburger.addEventListener("click", openMobileSidebar);

// ── Char counter ─────────────────────────────────────────────────
els.chapterText.addEventListener("input", () => {
  const len = els.chapterText.value.length;
  els.charCount.textContent = `${len.toLocaleString()} chars`;
  if (len > 18000) els.charCount.style.color = "var(--danger)";
  else if (len > 14000) els.charCount.style.color = "var(--warn)";
  else els.charCount.style.color = "";
});

// ── Duplicate chapter check ───────────────────────────────────────
els.chapterNumber.addEventListener("change", checkDuplicate);
function checkDuplicate() {
  const n = Number(els.chapterNumber.value);
  if (state.savedChapterNumbers.has(n)) {
    els.duplicateWarning.style.display = "flex";
    els.duplicateMsg.textContent =
      `Chapter ${n} has already been saved. Saving again will add duplicate facts to the canon.`;
  } else {
    els.duplicateWarning.style.display = "none";
  }
}

// ── Clear button ─────────────────────────────────────────────────
els.clearBtn.addEventListener("click", () => {
  els.chapterText.value = "";
  els.charCount.textContent = "0 chars";
  els.charCount.style.color = "";
  els.saveStatus.style.display = "none";
  els.saveStatus.className = "save-status";
  showToast("Editor cleared");
});

// ── Save chapter ──────────────────────────────────────────────────
els.saveBtn.addEventListener("click", async () => {
  const chapterNumber = Number(els.chapterNumber.value);
  const text = els.chapterText.value.trim();

  if (!text) {
    showStatus("error", "Please write or paste some chapter text before saving.");
    return;
  }
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    showStatus("error", "Chapter number must be a positive integer.");
    return;
  }

  setLoading(true, "Analyzing chapter…");
  els.saveBtn.disabled = true;

  try {
    const res = await fetch(`${API}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterNumber, text }),
    });
    const data = await res.json();

    if (!res.ok) {
      showStatus("error", `Error: ${data.error || "Something went wrong."}`);
      showToast("Save failed");
      return;
    }

    const factCount = data.factsExtracted.length;
    const contraCount = data.contradictions.length;

    if (contraCount > 0) {
      showStatus(
        "error",
        `⚠ Saved chapter ${chapterNumber}. Extracted ${factCount} fact${factCount !== 1 ? "s" : ""}. Found ${contraCount} contradiction${contraCount !== 1 ? "s" : ""} — check the Contradictions tab.`
      );
      showToast(`${contraCount} contradiction${contraCount !== 1 ? "s" : ""} flagged!`);
    } else {
      showStatus(
        "success",
        `✓ Chapter ${chapterNumber} saved. Extracted ${factCount} fact${factCount !== 1 ? "s" : ""}. No contradictions found — your canon is consistent.`
      );
      showToast(`Chapter ${chapterNumber} saved`);
    }

    state.savedChapterNumbers.add(chapterNumber);
    els.chapterText.value = "";
    els.charCount.textContent = "0 chars";
    els.charCount.style.color = "";
    checkDuplicate();
    await loadCanon();
  } catch (err) {
    showStatus("error", "Network error — is the server running? Try `npm start` in your terminal.");
    showToast("Network error");
    console.error(err);
  } finally {
    setLoading(false);
    els.saveBtn.disabled = false;
  }
});

// ── Ask the canon ─────────────────────────────────────────────────
async function askCanon(question) {
  if (!question.trim()) return;

  els.askBtn.disabled = true;
  els.answerContainer.style.display = "block";
  els.answerBox.textContent = "";
  els.answerBox.style.fontStyle = "normal";
  els.answerBox.style.color = "var(--text-2)";
  els.answerBox.textContent = "Thinking…";
  setLoading(true, "Asking the canon…");

  try {
    const res = await fetch(`${API}/canon/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question.trim() }),
    });
    const data = await res.json();

    els.answerBox.style.fontStyle = "italic";
    els.answerBox.style.color = "";

    if (res.ok) {
      els.answerBox.textContent = data.answer;
    } else {
      els.answerBox.textContent = `Error: ${data.error}`;
      els.answerBox.style.color = "var(--danger)";
    }
  } catch (err) {
    els.answerBox.textContent = "Network error — is the server running?";
    els.answerBox.style.color = "var(--danger)";
    console.error(err);
  } finally {
    setLoading(false);
    els.askBtn.disabled = false;
  }
}

els.askBtn.addEventListener("click", () => askCanon(els.questionInput.value));
els.questionInput.addEventListener("keydown", e => {
  if (e.key === "Enter") askCanon(els.questionInput.value);
});

els.sqChips.forEach(chip => {
  chip.addEventListener("click", () => {
    els.questionInput.value = chip.dataset.q;
    askCanon(chip.dataset.q);
  });
});

// ── Load canon (facts + contradictions) ──────────────────────────
async function loadCanon() {
  try {
    const res = await fetch(`${API}/canon`);
    const data = await res.json();
    state.facts = data.facts || [];
    state.contradictions = data.contradictions || [];
    renderFacts();
    renderContradictions();
    updateStats();
  } catch (err) {
    console.error("Failed to load canon:", err);
  }
}

// ── Render facts ─────────────────────────────────────────────────
function renderFacts() {
  const filtered = state.factFilter === "all"
    ? state.facts
    : state.facts.filter(f => f.fact_type === state.factFilter);

  // Update count badge
  const count = state.facts.length;
  els.factsCount.textContent = count;
  els.factsCount.style.display = count > 0 ? "inline-block" : "none";

  if (!filtered.length) {
    els.factsList.innerHTML = emptyState(
      state.factFilter === "all"
        ? "Story bible is empty"
        : `No ${state.factFilter} facts yet`,
      "Save your first chapter to start building your story's memory."
    );
    return;
  }

  // Group by entity
  const groups = {};
  filtered.forEach(f => {
    if (!groups[f.entity_name]) groups[f.entity_name] = [];
    groups[f.entity_name].push(f);
  });

  els.factsList.innerHTML = Object.entries(groups).map(([entity, facts]) => `
    <div class="fact-group" style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;padding-left:4px">${escapeHtml(entity)}</div>
      ${facts.map(f => `
        <div class="fact-card" style="margin-bottom:6px">
          <span class="fact-type-dot" data-type="${escapeHtml(f.fact_type)}"></span>
          <span class="fact-entity">${escapeHtml(f.entity_name)}</span>
          <span class="fact-attr">${escapeHtml(f.attribute.replace(/_/g, " "))}</span>
          <span class="fact-value">${escapeHtml(f.value)}</span>
          <span class="fact-chapter">ch. ${f.source_chapter}</span>
        </div>
      `).join("")}
    </div>
  `).join("");
}

// ── Render contradictions ────────────────────────────────────────
function renderContradictions() {
  const items = state.contradictions;
  const count = items.length;

  // Update nav badge
  els.contraCount.textContent = count;
  els.contraCount.style.display = count > 0 ? "inline-block" : "none";

  if (!count) {
    els.contradictionsList.innerHTML = emptyState(
      "All clear!",
      "No contradictions flagged yet. Save some chapters and the AI will watch for inconsistencies."
    );
    return;
  }

  els.contradictionsList.innerHTML = items.map(c => `
    <div class="contradiction-card">
      <div class="contra-header">
        <div class="contra-flag">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Contradiction
        </div>
        <span class="contra-entity">${escapeHtml(c.entity_name)}</span>
        <span class="contra-chapter">ch. ${c.chapter_number}</span>
      </div>
      <p class="contra-desc">${escapeHtml(c.description)}</p>
      ${c.suggested_fix ? `
        <div class="contra-fix">
          <span class="fix-label">Fix</span>
          <span class="fix-text">${escapeHtml(c.suggested_fix)}</span>
        </div>
      ` : ""}
    </div>
  `).join("");
}

// ── Load chapters ─────────────────────────────────────────────────
async function loadChapters() {
  try {
    const res = await fetch(`${API}/chapters`);
    const data = await res.json();
    state.chapters = data.chapters || [];
    state.savedChapterNumbers = new Set(state.chapters.map(c => c.chapter_number));
    renderChapters();
    checkDuplicate();
  } catch (err) {
    console.error("Failed to load chapters:", err);
  }
}

function renderChapters() {
  if (!state.chapters.length) {
    els.chaptersList.innerHTML = emptyState(
      "No chapters yet",
      "Go to Write to save your first chapter."
    );
    return;
  }

  els.chaptersList.innerHTML = state.chapters.map(c => `
    <div class="chapter-card">
      <div class="chapter-head">
        <span class="chapter-num-badge">Chapter ${c.chapter_number}</span>
        <span class="chapter-date">${formatDate(c.created_at)}</span>
      </div>
      <p class="chapter-preview">${escapeHtml(c.preview)}…</p>
    </div>
  `).join("");

  // Update stat
  els.statChapters.textContent = state.chapters.length;
}

// ── Update stats ─────────────────────────────────────────────────
function updateStats() {
  els.statFacts.textContent = state.facts.length;
  els.statContradictions.textContent = state.contradictions.length;
}

// ── Fact filter ───────────────────────────────────────────────────
els.filterBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    els.filterBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.factFilter = btn.dataset.filter;
    renderFacts();
  });
});

// ── Refresh contradiction button ──────────────────────────────────
els.refreshContraBtn.addEventListener("click", loadCanon);

// ── Health check ─────────────────────────────────────────────────
async function loadHealth() {
  try {
    const res = await fetch(`${API}/health`);
    const data = await res.json();
    const name = data.modelProvider || "unknown";
    els.providerLabel.textContent = `AI: ${name}`;
    if (name === "mock") {
      els.providerDot.style.background = "var(--warn)";
      els.providerDot.style.boxShadow = "0 0 6px var(--warn)";
    } else if (name === "watsonx") {
      els.providerLabel.textContent = "watsonx.ai";
    }
  } catch {
    els.providerLabel.textContent = "server offline";
    els.providerDot.style.background = "var(--danger)";
    els.providerDot.style.boxShadow = "0 0 6px var(--danger)";
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function showStatus(type, message) {
  els.saveStatus.style.display = "block";
  els.saveStatus.className = `save-status status-${type}`;
  els.saveStatus.textContent = message;
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function setLoading(visible, title = "Processing…") {
  els.loadingTitle.textContent = title;
  els.loadingOverlay.style.display = visible ? "flex" : "none";
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = String(str ?? "");
  return d.innerHTML;
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr.endsWith("Z") ? isoStr : isoStr + "Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function emptyState(title, body) {
  return `
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p class="empty-title">${escapeHtml(title)}</p>
      <p class="empty-body">${escapeHtml(body)}</p>
    </div>
  `;
}

// ── Init ──────────────────────────────────────────────────────────
loadHealth();
loadCanon();
loadChapters();
