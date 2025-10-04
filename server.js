// server.js
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// POST /api/ai/suggest — повертає Gemini-подібні підказки
app.post("/api/ai/suggest", (req, res) => {
  const layout = req.body.layout;
  const objects = layout?.activeModule?.objects || [];

  const suggestions = [];

  // Функція для створення Gemini-підказки
  const geminiHint = (category, importance, short, detail) => ({
    category,
    importance,  // "high", "medium", "low"
    short,
    detail
  });

  // Перевірки
  if (!objects.some(o => o.type === "bed")) {
    suggestions.push(geminiHint(
      "Life Support",
      "high",
      "No Bed detected",
      "Add at least one Bed for crew sleeping and rest."
    ));
  }

  if (!objects.some(o => o.type === "panel")) {
    suggestions.push(geminiHint(
      "Control Systems",
      "high",
      "No Panel detected",
      "Add a Panel to manage habitat systems efficiently."
    ));
  }

  if (!objects.some(o => o.type === "cabinet")) {
    suggestions.push(geminiHint(
      "Storage",
      "medium",
      "No Cabinet detected",
      "Add Cabinets along walls to free central space."
    ));
  }

  if (!objects.some(o => o.type === "kitchen")) {
    suggestions.push(geminiHint(
      "Food & Nutrition",
      "high",
      "No Kitchen detected",
      "Add a Kitchen for food preparation and crew nutrition."
    ));
  }

  if (!objects.some(o => o.type === "exercise")) {
    suggestions.push(geminiHint(
      "Health & Fitness",
      "medium",
      "No Exercise area",
      "Add an Exercise area to maintain crew physical health."
    ));
  }

  if (!objects.some(o => o.type === "private")) {
    suggestions.push(geminiHint(
      "Psychology",
      "medium",
      "No Private Space",
      "Add Private Spaces to ensure crew psychological well-being."
    ));
  }

  // Перевірка коридору
  const corridorClear = objects.every(o => {
    if (!o.type || !o.x || !o.y || !o.w || !o.h) return true;
    const c = layout.activeModule.corridor;
    const overlap = o.x < c.x + c.w && o.x + o.w > c.x && o.y < c.y + c.h && o.y + o.h > c.y;
    return !overlap;
  });

  if (!corridorClear) {
    suggestions.push(geminiHint(
      "Safety",
      "high",
      "Corridor blocked",
      "Ensure main corridors remain clear for crew movement."
    ));
  }

  // Приклади рекомендацій щодо розміщення
  const beds = objects.filter(o => o.type === "bed");
  const panels = objects.filter(o => o.type === "panel");

  beds.forEach(b => {
    panels.forEach(p => {
      const dx = (b.x + b.w/2) - (p.x + p.w/2);
      const dy = (b.y + b.h/2) - (p.y + p.h/2);
      const dist = Math.hypot(dx, dy);
      if (dist < 120) {
        suggestions.push(geminiHint(
          "Life Support",
          "low",
          "Bed too close to Panel",
          "Consider placing Bed further from Panel to reduce noise/light exposure."
        ));
      }
    });
  });

  res.json(suggestions);
});

app.listen(PORT, () => {
  console.log(`Gemini AI server running at http://localhost:${PORT}`);
});
