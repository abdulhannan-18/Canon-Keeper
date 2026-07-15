// ═══════════════════════════════════════════════════════════════
// Canon Keeper — Model Adapter
//
// Three swappable AI backends behind one interface:
//   mock        → zero setup, deterministic pattern matching
//   huggingface → free Inference API, no credit card needed
//   watsonx     → IBM watsonx.ai with Granite (required for submission)
//
// Switch by setting MODEL_PROVIDER in .env.
// Every provider implements: extractFacts, checkContradictions, answerQuestion
// ═══════════════════════════════════════════════════════════════

const PROVIDER = (process.env.MODEL_PROVIDER || "mock").toLowerCase();

// ── Shared prompts ──────────────────────────────────────────────
const EXTRACTION_PROMPT = `You are a fact-extraction engine for a fiction writing tool.
Read the chapter text and extract every concrete, explicitly-stated fact about characters, locations, timeline events, and important objects.
Respond with ONLY a JSON array — no prose, no markdown fences, no explanation.
Each item MUST have exactly these fields:
  {"entity_name": string, "fact_type": "character"|"location"|"timeline"|"object", "attribute": string, "value": string}
Rules:
- Only include facts explicitly stated in the text. Do not infer or invent.
- "attribute" should be a short snake_case descriptor: eye_color, status, hair_color, age, occupation, relationship, located_at, event, etc.
- "value" should be a concise, factual string.
- If there are no extractable facts, respond with [].
Do not include any text before or after the JSON array.`;

const CONTRADICTION_PROMPT = `You are a continuity checker for a fiction writing tool.
You will be given NEW facts extracted from the latest chapter, and EXISTING facts already in the story canon.
Identify any direct contradictions — where a new fact conflicts with an established fact about the same entity and attribute.
Respond with ONLY a JSON array — no prose, no markdown fences, no explanation.
Each item MUST have exactly these fields:
  {"entity_name": string, "description": string, "existing_value": string, "new_value": string, "suggested_fix": string}
Rules:
- Only flag genuine conflicts, not new detail that adds to (rather than contradicts) existing facts.
- "description" should be a clear, human-readable explanation of the conflict.
- "suggested_fix" should be a practical, concrete suggestion for the writer.
- If there are no contradictions, respond with [].
Do not include any text before or after the JSON array.`;

const QA_PROMPT = `You are the memory of a fiction story. Your job is to answer the writer's question using ONLY the canon facts provided.
If the canon facts do not contain enough information to answer the question, say so plainly — do not guess or invent details.
Keep the answer to 1–4 sentences. Write in a clear, helpful tone as if you are a knowledgeable research assistant.`;

// ── JSON extractor (robust against model prose/fences) ──────────
function extractJson(raw) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[\[{]/);
  if (start === -1) return null;
  const slice = cleaned.slice(start);
  try {
    return JSON.parse(slice);
  } catch {
    // try trimming trailing junk after the last valid bracket
    const end = Math.max(slice.lastIndexOf("]"), slice.lastIndexOf("}"));
    if (end === -1) return null;
    try { return JSON.parse(slice.slice(0, end + 1)); } catch { return null; }
  }
}

// Valid fact types
const VALID_FACT_TYPES = new Set(["character", "location", "timeline", "object"]);

function normalizeFacts(parsed, chapterNumber) {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(f => f && f.entity_name && f.attribute && f.value)
    .map(f => ({
      entity_name:   String(f.entity_name).trim().slice(0, 120),
      fact_type:     VALID_FACT_TYPES.has(f.fact_type) ? f.fact_type : "character",
      attribute:     String(f.attribute).trim().toLowerCase().replace(/\s+/g, "_").slice(0, 80),
      value:         String(f.value).trim().slice(0, 300),
      source_chapter: chapterNumber,
    }));
}

// ═══════════════════════════════════════════════════════════════
// MOCK PROVIDER
// Smart pattern matching — enough to demo the full pipeline with
// zero API keys. Much more robust than the original.
// NOT a real AI — swap to watsonx for actual submission.
// ═══════════════════════════════════════════════════════════════
const mockProvider = {
  async extractFacts(text, chapterNumber) {
    const facts = [];
    const sentences = text.split(/[.!?]+/);

    // Eye color
    const eyePatterns = [
      /([A-Z][a-z]{1,20})(?:'s| had| has) (\w+)(?:-\w+)? eyes/g,
      /eyes (?:of|were|was|are) (\w+)/g,
    ];
    let m;
    const eyeRe = /([A-Z][a-z]{1,20})(?:'s| had| has) (\w+(?:-\w+)?) eyes/g;
    while ((m = eyeRe.exec(text)) !== null) {
      facts.push({ entity_name: m[1], fact_type: "character", attribute: "eye_color", value: m[2], source_chapter: chapterNumber });
    }

    // Hair color
    const hairRe = /([A-Z][a-z]{1,20})(?:'s| had| has) (\w+(?:-\w+)?) hair/g;
    while ((m = hairRe.exec(text)) !== null) {
      facts.push({ entity_name: m[1], fact_type: "character", attribute: "hair_color", value: m[2], source_chapter: chapterNumber });
    }

    // Age
    const ageRe = /([A-Z][a-z]{1,20}) (?:was|is|turned|aged?) (\d{1,3})(?: years? old)?/g;
    while ((m = ageRe.exec(text)) !== null) {
      facts.push({ entity_name: m[1], fact_type: "character", attribute: "age", value: m[2], source_chapter: chapterNumber });
    }

    // Occupation / role
    const jobRe = /([A-Z][a-z]{1,20}) (?:was|is|worked as|became) (?:a |an )([\w\s]{2,30}?)(?:\.|,| who| and)/g;
    while ((m = jobRe.exec(text)) !== null) {
      const job = m[2].trim();
      if (job.split(" ").length <= 4) {
        facts.push({ entity_name: m[1], fact_type: "character", attribute: "occupation", value: job, source_chapter: chapterNumber });
      }
    }

    // Death / status
    const deathRe = /([A-Z][a-z]{1,20}) (?:died|was killed|was murdered|was dead|had died|passed away)/g;
    while ((m = deathRe.exec(text)) !== null) {
      facts.push({ entity_name: m[1], fact_type: "character", attribute: "status", value: "dead", source_chapter: chapterNumber });
    }

    // Alive actions
    const aliveRe = /([A-Z][a-z]{1,20}) (?:walked|smiled|said|laughed|ran|spoke|whispered|shouted|looked|sat|stood|turned|opened|closed|replied|answered|entered|left|arrived|nodded|shook)/g;
    while ((m = aliveRe.exec(text)) !== null) {
      // Only add if we haven't already noted them as dead
      const alreadyDead = facts.some(f => f.entity_name === m[1] && f.attribute === "status" && f.value === "dead");
      if (!alreadyDead) {
        facts.push({ entity_name: m[1], fact_type: "character", attribute: "status", value: "alive", source_chapter: chapterNumber });
      }
    }

    // Locations
    const locRe = /([A-Z][a-z]{1,20}) (?:was in|arrived at|entered|lived in|stood in|sat in|walked into) (?:the |a |an )?([\w\s]{2,30}?)(?:\.|,)/g;
    while ((m = locRe.exec(text)) !== null) {
      facts.push({ entity_name: m[1], fact_type: "location", attribute: "located_at", value: m[2].trim(), source_chapter: chapterNumber });
    }

    // Named locations (proper nouns preceded by "the")
    const placeRe = /the ([A-Z][a-zA-Z\s]{2,30}?) (?:was|stood|loomed|lay|sat|nestled)/g;
    while ((m = placeRe.exec(text)) !== null) {
      facts.push({ entity_name: m[1].trim(), fact_type: "location", attribute: "exists", value: "yes", source_chapter: chapterNumber });
    }

    // Relationships
    const relRe = /([A-Z][a-z]{1,20})(?:'s)? (sister|brother|mother|father|wife|husband|son|daughter|friend|enemy|mentor|student|partner)/g;
    while ((m = relRe.exec(text)) !== null) {
      facts.push({ entity_name: m[1], fact_type: "character", attribute: "has_" + m[2], value: "mentioned", source_chapter: chapterNumber });
    }

    // Deduplicate by entity+attribute (keep last)
    const seen = new Map();
    for (const f of facts) {
      seen.set(`${f.entity_name}|${f.attribute}`, f);
    }
    return Array.from(seen.values());
  },

  async checkContradictions(newFacts, existingFacts) {
    const contradictions = [];
    for (const nf of newFacts) {
      const conflicts = existingFacts.filter(
        ef =>
          ef.entity_name.toLowerCase() === nf.entity_name.toLowerCase() &&
          ef.attribute === nf.attribute &&
          String(ef.value).toLowerCase() !== String(nf.value).toLowerCase()
      );
      for (const ef of conflicts) {
        contradictions.push({
          entity_name:   nf.entity_name,
          description:   `${nf.entity_name}'s ${nf.attribute.replace(/_/g, " ")} was established as "${ef.value}" (chapter ${ef.source_chapter}) but this chapter says "${nf.value}".`,
          existing_value: String(ef.value),
          new_value:      String(nf.value),
          suggested_fix:  `Either change this chapter to match "${ef.value}", or if this is intentional, add a note explaining the change and update earlier chapters for consistency.`,
        });
      }
    }
    return contradictions;
  },

  async answerQuestion(question, canonFacts) {
    if (!canonFacts.length) {
      return "No canon facts have been established yet. Save a few chapters first, then come back and ask.";
    }
    const q = question.toLowerCase();

    // Find entities mentioned in the question
    const entityNames = [...new Set(canonFacts.map(f => f.entity_name))];
    const mentioned = entityNames.filter(name => q.includes(name.toLowerCase()));

    if (!mentioned.length) {
      // Try keyword search
      const keywords = q.replace(/[?.,!]/g, "").split(/\s+/).filter(w => w.length > 3);
      const relevant = canonFacts.filter(f =>
        keywords.some(kw => f.entity_name.toLowerCase().includes(kw) || f.attribute.includes(kw) || f.value.toLowerCase().includes(kw))
      );
      if (!relevant.length) {
        return `The canon doesn't contain information about that yet. The established entities are: ${entityNames.join(", ")}.`;
      }
      return relevant.map(f =>
        `${f.entity_name}'s ${f.attribute.replace(/_/g, " ")} is "${f.value}" (chapter ${f.source_chapter}).`
      ).join(" ");
    }

    const relevant = canonFacts.filter(f => mentioned.some(name => f.entity_name.toLowerCase() === name.toLowerCase()));
    return relevant.map(f =>
      `${f.entity_name}'s ${f.attribute.replace(/_/g, " ")} is "${f.value}" (established in chapter ${f.source_chapter}).`
    ).join(" ");
  },
};

// ═══════════════════════════════════════════════════════════════
// WATSONX.AI PROVIDER
// ═══════════════════════════════════════════════════════════════
let _iamToken = null;
let _iamExpiry = 0;

async function getWatsonxToken() {
  const now = Date.now();
  if (_iamToken && now < _iamExpiry - 60_000) return _iamToken;

  const apiKey = process.env.WATSONX_API_KEY;
  if (!apiKey) throw new Error("WATSONX_API_KEY is not set in .env");

  const res = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ibm:params:oauth:grant-type:apikey",
      apikey: apiKey,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`IBM IAM token request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  _iamToken  = data.access_token;
  _iamExpiry = now + data.expires_in * 1000;
  return _iamToken;
}

async function watsonxGenerate(systemPrompt, userPrompt) {
  const token     = await getWatsonxToken();
  const region    = process.env.WATSONX_REGION    || "us-south";
  const projectId = process.env.WATSONX_PROJECT_ID;
  const modelId   = process.env.WATSONX_MODEL_ID  || "ibm/granite-3-8b-instruct";

  if (!projectId) throw new Error("WATSONX_PROJECT_ID is not set in .env");

  const url = `https://${region}.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model_id:   modelId,
      project_id: projectId,
      input:      `${systemPrompt}\n\n${userPrompt}`,
      parameters: {
        decoding_method:    "greedy",
        max_new_tokens:     1000,
        repetition_penalty: 1.05,
        stop_sequences:     [],
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`watsonx.ai request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.results?.[0]?.generated_text ?? "";
}

const watsonxProvider = {
  async extractFacts(text, chapterNumber) {
    const raw    = await watsonxGenerate(EXTRACTION_PROMPT, `Chapter ${chapterNumber} text:\n\n"""${text}"""`);
    const parsed = extractJson(raw);
    return normalizeFacts(parsed, chapterNumber);
  },

  async checkContradictions(newFacts, existingFacts) {
    if (!newFacts.length || !existingFacts.length) return [];
    const raw    = await watsonxGenerate(
      CONTRADICTION_PROMPT,
      `NEW facts from latest chapter:\n${JSON.stringify(newFacts, null, 2)}\n\nEXISTING canon facts:\n${JSON.stringify(existingFacts, null, 2)}`
    );
    const parsed = extractJson(raw);
    return Array.isArray(parsed) ? parsed : [];
  },

  async answerQuestion(question, canonFacts) {
    const raw = await watsonxGenerate(
      QA_PROMPT,
      `Canon facts (JSON):\n${JSON.stringify(canonFacts, null, 2)}\n\nWriter's question: ${question}`
    );
    return raw.trim() || "I couldn't find a clear answer in the canon. Try rephrasing or save more chapters.";
  },
};

// ═══════════════════════════════════════════════════════════════
// HUGGING FACE INFERENCE API PROVIDER
// Free tier, no credit card needed. Great fallback.
// ═══════════════════════════════════════════════════════════════
async function hfGenerate(systemPrompt, userPrompt) {
  const apiKey  = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey)  throw new Error("HUGGINGFACE_API_KEY is not set in .env");
  const modelId = process.env.HUGGINGFACE_MODEL_ID || "mistralai/Mixtral-8x7B-Instruct-v0.1";

  // Use the chat completions format for instruct models
  const messages = [
    { role: "system",  content: systemPrompt },
    { role: "user",    content: userPrompt   },
  ];

  const res = await fetch(`https://api-inference.huggingface.co/models/${modelId}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelId, messages, max_tokens: 1000, temperature: 0.1 }),
  });

  if (!res.ok) {
    // Fallback: try the older text-generation endpoint
    const res2 = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        inputs: `<s>[INST] ${systemPrompt}\n\n${userPrompt} [/INST]`,
        parameters: { max_new_tokens: 1000, return_full_text: false, temperature: 0.1 },
      }),
    });
    if (!res2.ok) {
      const body = await res2.text().catch(() => "");
      throw new Error(`Hugging Face request failed (${res2.status}): ${body.slice(0, 300)}`);
    }
    const data2 = await res2.json();
    return Array.isArray(data2) ? (data2[0]?.generated_text ?? "") : (data2.generated_text ?? "");
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

const huggingfaceProvider = {
  async extractFacts(text, chapterNumber) {
    const raw    = await hfGenerate(EXTRACTION_PROMPT, `Chapter ${chapterNumber} text:\n\n"""${text}"""`);
    const parsed = extractJson(raw);
    return normalizeFacts(parsed, chapterNumber);
  },

  async checkContradictions(newFacts, existingFacts) {
    if (!newFacts.length || !existingFacts.length) return [];
    const raw    = await hfGenerate(
      CONTRADICTION_PROMPT,
      `NEW facts:\n${JSON.stringify(newFacts, null, 2)}\n\nEXISTING facts:\n${JSON.stringify(existingFacts, null, 2)}`
    );
    const parsed = extractJson(raw);
    return Array.isArray(parsed) ? parsed : [];
  },

  async answerQuestion(question, canonFacts) {
    const raw = await hfGenerate(
      QA_PROMPT,
      `Canon facts:\n${JSON.stringify(canonFacts, null, 2)}\n\nQuestion: ${question}`
    );
    return raw.trim() || "I couldn't find a clear answer in the canon. Try rephrasing or save more chapters.";
  },
};

// ── Provider registry ────────────────────────────────────────────
const providers = {
  mock:        mockProvider,
  watsonx:     watsonxProvider,
  huggingface: huggingfaceProvider,
};

if (!providers[PROVIDER]) {
  throw new Error(
    `Unknown MODEL_PROVIDER "${PROVIDER}". Valid options: mock, watsonx, huggingface`
  );
}

const activeProvider      = providers[PROVIDER];
activeProvider.activeProviderName = PROVIDER;

module.exports = activeProvider;
