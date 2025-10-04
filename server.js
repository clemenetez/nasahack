// server.js — AI proxy на порті 5000
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const API_KEY = "AIzaSyDh-wxUUl1-fktdTQMB8h1XS63afcXu6oc";

app.post("/api/ai/suggest", async (req, res) => {
  const { layout } = req.body || {};

  if (!API_KEY) {
    // Локальний fallback
    const suggestions = [];
    const objs = layout?.objects || [];
    if (objs.length === 0) suggestions.push({ type:"hint", msg:"Layout is empty. Add Bed and Panel." });
    if (!objs.some(o=>o.type==="cabinet")) suggestions.push({ type:"hint", msg:"Consider adding a Cabinet for storage." });
    return res.json(suggestions);
  }

  try {
    const prompt = `You are an expert in NASA habitable module layout. Given this JSON layout, list concise issues and suggestions. JSON:\n${JSON.stringify(layout)}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
    const body = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

    const suggestions = text.split(/\n+/).filter(Boolean).map(line => ({ type:"hint", msg: line.replace(/^\-+\s?/, "") }));
    res.json(suggestions);
  } catch (err) {
    res.json([{ type:"error", msg: String(err) }]);
  }
});

const PORT = 5000; // інший порт!
app.listen(PORT, () => console.log(`AI proxy listening on http://localhost:${PORT}`));
