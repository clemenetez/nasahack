// server.js — Express proxy for Ollama (Docker)
// Run: node server.js
// Env: OLLAMA_HOST=http://localhost:11434  OLLAMA_MODEL=llama3.1  PORT=5000

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 5000;

// Ollama settings
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));

// --- Helper: build prompt from your layout object (kept from your current logic) ---
function generatePrompt(layout) {
  const activeModule = layout?.activeModule || {};
  const objects = Array.isArray(layout?.objects) ? layout.objects : [];
   const moduleName = layout?.moduleName || activeModule?.name || "Unnamed Module";

  let text =
      "You are an AI assistant helping design a 2D space habitat. " +
    "Evaluate the layout and provide actionable suggestions in short sentences in English. " +
    "Only output suggestions, one per line. Do not explain or add extra text.\n\n";
  text += `Module name: ${moduleName}\n`;

  if (activeModule?.w && activeModule?.h) {
    text += `Active module dimensions: ${activeModule.w}x${activeModule.h}\n`;
  }
  if (activeModule?.corridor) {
    try {
      text += `Corridor: ${JSON.stringify(activeModule.corridor)}\n`;
    } catch {}
  }

  text += "Objects in the module:\n";
  for (const o of objects) {
    const { type, x, y, w, h } = o || {};
    text += `- ${type ?? "object"} at (${x ?? "?"},${y ?? "?"}) size ${w ?? "?"}x${h ?? "?"}\n`;
  }
  text += "\nProvide suggestions for better placement, accessibility, and free space.";
  return text;
}

// --- Helper: call Ollama REST API ---
async function sendToOllama(prompt) {
  const resp = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      // options: { temperature: 0.3 } // uncomment to tune
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Ollama API error: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  // data.response is a string with the full completion
  return data?.response || "";
}

// --- API route consumed by your frontend ---
app.post("/api/ai/suggest", async (req, res) => {
  try {
    const layout = req.body?.layout;
    if (!layout) {
      return res.status(400).json([{ type: "error", msg: "No layout provided" }]);
    }

    const prompt = generatePrompt(layout);
    const aiText = await sendToOllama(prompt);

    const suggestions = aiText
      .split("\n")
      .map((s) => s.trim().replace(/^[-*]\s*/, ""))
      .filter(Boolean)
      .map((msg) => ({ type: "hint", msg }));

    // fallback if model returns a paragraph
    if (suggestions.length === 0 && aiText) {
      suggestions.push({ type: "hint", msg: aiText.trim() });
    }

    res.json(suggestions);
  } catch (err) {
    console.error(err);
    res.status(500).json([{ type: "error", msg: String(err.message || err) }]);
  }
});

// --- Simple health endpoint ---
app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    provider: "ollama",
    host: OLLAMA_HOST,
    model: OLLAMA_MODEL,
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT} (model=${OLLAMA_MODEL})`);
  console.log(`Ollama host: ${OLLAMA_HOST}`);
});
