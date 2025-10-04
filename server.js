// server.js — Minimal Gemini AI proxy
// Usage: node server.js (requires: npm i express cors node-fetch)
// Set your GEMINI_API_KEY below or via environment variable.

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// === Встав свій ключ сюди ===
const API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDh-wxUUl1-fktdTQMB8h1XS63afcXu6oc";

app.post("/api/ai/suggest", async (req, res) => {
  const { layout } = req.body || {};

  // --- fallback якщо ключ не заданий ---
  if (!API_KEY) {
    const suggestions = [];
    try {
      const objs = layout?.objects || [];
      if (objs.length === 0) suggestions.push({ type:"hint", msg:"Layout is empty. Add Bed and Panel." });
      if (!objs.some(o=>o.type==="cabinet")) suggestions.push({ type:"hint", msg:"Consider adding a Cabinet for storage." });
      return res.json(suggestions);
    } catch (e) {
      return res.json([{ type:"error", msg:"Local fallback error." }]);
    }
  }

  try {
    // === Prompt для Gemini ===
    const prompt = `You are an expert in NASA habitable module layout. 
Given this JSON layout, list concise issues and suggestions.
JSON:\n${JSON.stringify(layout)}`;

    // === Gemini endpoint ===
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json();

    // --- логування для дебагу ---
    console.log("=== Gemini API Response ===");
    console.log(JSON.stringify(data, null, 2));

    // --- витягуємо текст ---
    const text = data?.candidates?.[0]?.content?.[0]?.text || data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

    // --- перетворюємо в масив підказок ---
    const suggestions = text.split(/\n+/).filter(Boolean).map(line => ({ type:"hint", msg: line.replace(/^\-+\s?/, "") }));

    res.json(suggestions);
  } catch (err) {
    console.error(err);
    res.json([{ type:"error", msg:"AI request failed: " + String(err) }]);
  }
});

app.listen(3000, () => console.log("AI proxy listening on http://localhost:3000"));
