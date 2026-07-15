# Canon Keeper

> **Your story's memory. Powered by AI.**

Canon Keeper is an AI continuity partner for writers. Paste chapters as you write — it automatically extracts every character, location, and timeline fact, then instantly flags contradictions when your story conflicts with itself.

Built for the **IBM SkillsBuild "Reimagine Creative Industries with AI"** hackathon.
Primary AI: **IBM watsonx.ai (Granite)**. Also works with Hugging Face (free, no card) and a built-in mock for zero-setup development.

---

## What it does

Long-form writers lose track of their own facts as a story grows — eye colors that change, characters who die then reappear, timelines that stop adding up. The usual fix is a manually maintained "story bible" spreadsheet that nobody keeps updated.

Canon Keeper keeps it updated automatically:

1. **Write or paste a chapter** into the editor.
2. The AI extracts structured facts (characters, locations, timeline, objects) and stores them in your **Story Bible**.
3. Every new chapter is cross-checked against the stored canon. **Contradictions are flagged immediately** with a suggested fix.
4. **Ask the canon any question** ("What color are Elena's eyes?") and get an instant, grounded answer — no re-reading required.

---

## Quick start (60 seconds)

```bash
git clone https://github.com/YOUR_USERNAME/canon-keeper.git
cd canon-keeper
npm install
cp .env.example .env
npm start
```

Open **http://localhost:3000** — the full app works immediately with no API key (mock mode).

---

## Getting a FREE AI key (no credit card)

**Hugging Face** — completely free, takes 60 seconds:

1. Go to https://huggingface.co/join and create a free account.
2. Go to https://huggingface.co/settings/tokens → **New token** → type: **Read**.
3. Copy the token into `.env`:

```env
MODEL_PROVIDER=huggingface
HUGGINGFACE_API_KEY=hf_your_token_here
```

4. Restart: `npm start`. The console will confirm `AI provider: huggingface`.

That's it. Real AI, no credit card, full contradiction detection and Q&A.

---

## Switching to watsonx.ai (IBM hackathon requirement)

If you have IBM Cloud access:

1. Sign up at https://cloud.ibm.com (general free trial — often no card required).
2. Provision a **watsonx.ai** service and create a project.
3. Find your **Project ID**: project → Manage → General.
4. Create an **API key**: IBM Cloud → Manage → Access (IAM) → API keys.
5. Update `.env`:

```env
MODEL_PROVIDER=watsonx
WATSONX_API_KEY=your-ibm-api-key
WATSONX_PROJECT_ID=your-project-id
WATSONX_REGION=us-south
WATSONX_MODEL_ID=ibm/granite-3-8b-instruct
```

6. Restart: `npm start`. Console confirms `AI provider: watsonx`.

**Tip for the hackathon**: Build and demo with `huggingface` if you're still sorting out IBM Cloud access. The prompts, pipeline, and JSON contract are identical — just swap `MODEL_PROVIDER=watsonx` before final submission.

---

## Project structure

```
canon-keeper/
├── server/
│   ├── index.js            Express app, security middleware, routes
│   ├── db.js               SQLite schema + queries (better-sqlite3)
│   ├── lib/
│   │   └── modelAdapter.js Swappable AI: mock | watsonx | huggingface
│   └── routes/
│       ├── chapters.js     POST /api/chapters  (save + extract + check)
│       └── canon.js        GET  /api/canon     (all facts + contradictions)
│                           POST /api/canon/ask (Q&A)
├── public/                 Plain HTML/CSS/JS frontend, zero build step
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/                   SQLite file — auto-created, gitignored
├── docs/
│   └── watsonx-setup.md
├── .env.example            Copy to .env — never commit the real .env
└── package.json
```

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/health` | Server + AI provider status |
| `GET`  | `/api/chapters` | List saved chapters (with previews) |
| `POST` | `/api/chapters` | Save chapter, extract facts, check contradictions |
| `GET`  | `/api/canon` | All facts + all contradictions |
| `POST` | `/api/canon/ask` | Ask a question about the story canon |

### POST /api/chapters

```json
{
  "chapterNumber": 1,
  "text": "Your chapter text here..."
}
```

Response:
```json
{
  "chapterId": 1,
  "factsExtracted": [
    { "entity_name": "Elena", "fact_type": "character", "attribute": "eye_color", "value": "green", "source_chapter": 1 }
  ],
  "contradictions": []
}
```

### POST /api/canon/ask

```json
{ "question": "What color are Elena's eyes?" }
```

Response:
```json
{ "answer": "Elena's eye color is green, established in chapter 1." }
```

---

## Security

- **Helmet** — sets standard HTTP security headers (CSP, HSTS, no-sniff, frame options).
- **CORS** — restricted to an explicit origin allowlist via `CORS_ORIGIN` in `.env`.
- **Rate limiting** — 100 requests per 15 minutes per IP. Protects AI quota from abuse.
- **Input validation** — type and length checks on every request before touching the database or calling the model.
- **Parameterized queries** — `better-sqlite3` prepared statements throughout; no string-interpolated SQL, no SQL injection surface.
- **No secret leakage** — errors are logged server-side but never send stack traces or internals to the client.
- **`.env` is gitignored** — only `.env.example` (no real values) is committed.
- **Chapter upsert** — re-saving the same chapter clears old facts first, preventing duplicate contradiction noise.

---

## Demo script (for judges)

1. **Save Chapter 1**: introduce Elena with green eyes and a description of the lighthouse.
2. **Save Chapter 2**: write a scene where Elena has brown eyes. Watch the contradiction get flagged instantly.
3. **Ask the canon**: "What color are Elena's eyes?" — get an instant, grounded answer.
4. **Story Bible tab**: see every extracted fact organized by entity.

---

## Built with

- **IBM watsonx.ai (Granite)** — fact extraction, contradiction detection, Q&A
- **IBM Bob** — scaffolding, architecture, and code generation
- **Express + SQLite** — lightweight backend, zero infrastructure
- **Plain HTML/CSS/JS** — zero build step, instant to run
- **Hugging Face Inference API** — free AI fallback for development

---

*Canon Keeper — because great stories deserve a consistent truth.*
