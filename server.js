/**
 * Full-featured Gemini AI Proxy for Habitat Layout
 * Usage: node server.js
 * Requirements: npm i express cors node-fetch
 * Set GEMINI_API_KEY in environment variables or paste your key below
 */

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors()); // дозволяємо запити з будь-якого фронтенду
app.use(express.json({ limit: "2mb" }));

// Встав свій ключ тут або використовуй process.env.GEMINI_API_KEY
const API_KEY = process.env.GEMINI_API_KEY || "ТУТ_ВСТАВ_СВІЙ_КЛЮЧ";

// Дефолтний fallback для локальних підказок
function localFallback(layout) {
  const suggestions = [];
  const objs = layout?.objects || [];
  if (objs.length === 0) suggestions.push({ type: "hint", msg: "Layout is empty. Add Bed and Panel." });
  if (!objs.some(o => o.type === "cabinet")) suggestions.push({ type: "hint", msg: "Consider adding a Cabinet for storage." });
  if (!objs.some(o => o.type === "kitchen")) suggestions.push({ type: "hint", msg: "Consider adding a Kitchen for food prep." });
  if (!objs.some(o => o.type === "exercise")) suggestions.push({ type: "hint", msg: "Consider adding an Exercise area for crew health." });
  if (!objs.some(o => o.type === "private")) suggestions.push({ type: "hint", msg: "Consider adding Private Space for crew psychology." });
  return suggestions;
}

// AI endpoint
app.post("/api/ai/suggest", async (req, res) => {
  const { layout } = req.body || {};

  if (!API_KEY) {
    // повертаємо локальний fallback
    return res.json(localFallback(layout));
  }

  try {
    // Формуємо промпт для Gemini
    const prompt = `You are an expert in NASA habitable module layout. 
Given this JSON layout, list concise issues and suggestions. JSON:\n${JSON.stringify(layout)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      throw new Error(`Gemini API responded with status ${r.status}`);
    }

    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.json([{ type: "error", msg: "No response from Gemini API" }]);
    }

    // Розбиваємо на рядки і відправляємо
    const suggestions = text
      .split(/\n+/)
      .filter(Boolean)
      .map(line => ({ type: "hint", msg: line.replace(/^\-+\s?/, "") }));

    res.json(suggestions);
  } catch (err) {
    console.error("AI proxy error:", err);
    res.json([{ type: "error", msg: `AI proxy error: ${err.message}` }]);
  }
});

// Optional: перевірка, що сервер живий
app.get("/", (req, res) => res.send("AI proxy running"));

// Слухаємо порт 3000
app.listen(3000, () => console.log("AI proxy listening on http://localhost:3000"));
