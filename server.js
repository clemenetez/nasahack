// Minimal Gemini proxy for Cursor/Node (optional).
// Usage: node server.js (requires: npm i express cors node-fetch)
// Set GEMINI_API_KEY in environment variables.

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const API_KEY = process.env.GEMINI_API_KEY || "";

app.post("/api/ai/suggest", async (req, res) => {
  const { layout } = req.body || {};
  if (!API_KEY) {
    // Fallback: simple local heuristic suggestions if no key provided
    const suggestions = [];
    try {
      // naive eval similar to client validateLayout
      const objs = layout?.objects || [];
      if (objs.length === 0) suggestions.push({ type:"hint", msg:"Layout is empty. Add Bed and Panel." });
      if (!objs.some(o=>o.type==="cabinet")) suggestions.push({ type:"hint", msg:"Consider adding a Cabinet for storage." });
      return res.json(suggestions);
    } catch (e) {
      return res.json([{ type:"error", msg:"Local fallback error." }]);
    }
  }
  try {
    const prompt = `You are an expert in NASA habitable module layout. Given this JSON layout, list concise issues and suggestions. JSON:\n${JSON.stringify(layout)}`;
    // Example Gemini (text) endpoint. Adjust to current stable endpoint if needed.
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key="+API_KEY;
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }]}]
    };
    const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
    // naive parse: split lines to suggestions
    const suggestions = text.split(/\n+/).filter(Boolean).map(line => ({ type:"hint", msg: line.replace(/^\-+\s?/, "") }));
    res.json(suggestions);
  } catch (err) {
    res.json([{ type:"error", msg:String(err) }]);
  }
});

app.listen(3000, () => console.log("AI proxy listening on http://localhost:3000"));
