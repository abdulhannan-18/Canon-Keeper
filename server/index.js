require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const chaptersRouter = require("./routes/chapters");
const canonRouter    = require("./routes/canon");
const model          = require("./lib/modelAdapter");

const app  = express();
const PORT = process.env.PORT || 3000;

// Railway (and most cloud platforms) sit behind a reverse proxy.
// This tells Express to trust the X-Forwarded-* headers so that
// rate-limiting, IP logging, and HTTPS detection work correctly.
app.set("trust proxy", 1);

// ── Security: HTTP headers ────────────────────────────────────────
// Helmet sets Content-Security-Policy, HSTS, no-sniff, etc.
// We relax the font-src / style-src only enough for Google Fonts in the UI.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc:     ["'self'", "https://fonts.gstatic.com"],
        scriptSrc:   ["'self'"],
        imgSrc:      ["'self'", "data:"],
        connectSrc:  ["'self'"],
      },
    },
  })
);

// ── Security: CORS ────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((o) => o.trim());

const corsOptions = allowedOrigins.includes("*")
  ? { origin: "*", methods: ["GET", "POST", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type"] }
  : {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error("Not allowed by CORS"));
      },
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    };

app.use(cors(corsOptions));

// ── Security: rate limiting ───────────────────────────────────────
// Protects metered watsonx.ai / Hugging Face quota from abuse.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down and try again in a few minutes." },
  })
);

app.use(express.json({ limit: "2mb" }));

// ── Static frontend ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "public")));

// ── API routes ────────────────────────────────────────────────────
app.use("/api/chapters", chaptersRouter);
app.use("/api/canon",    canonRouter);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", modelProvider: model.activeProviderName });
});

// 404 for unknown API routes
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

// SPA fallback — serve index.html for any non-API route
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ── Central error handler ────────────────────────────────────────
// Never leaks stack traces or internals to the client.
app.use((err, _req, res, _next) => {
  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed." });
  }
  console.error("Unhandled error:", err.message || err);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  Canon Keeper running → http://localhost:${PORT}`);
  console.log(`  AI provider: ${model.activeProviderName}`);
  if (model.activeProviderName === "mock") {
    console.log(
      "\n  [MOCK MODE] Running with built-in pattern matching — no API key needed."
    );
    console.log(
      "  Set MODEL_PROVIDER=watsonx or MODEL_PROVIDER=huggingface in .env for real AI.\n"
    );
  }
});
