// server.js
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000; // сервер на окремому порту

app.use(cors());
app.use(express.json());

// POST /api/ai/suggest — повертає підказки AI
app.post("/api/ai/suggest", (req, res) => {
  const layout = req.body.layout;

  // Проста "AI логіка": перевірка на відсутність базових об'єктів
  const suggestions = [];
  const objects = layout?.activeModule?.objects || [];

  const hasBed = objects.some(o => o.type === "bed");
  const hasPanel = objects.some(o => o.type === "panel");
  const hasCabinet = objects.some(o => o.type === "cabinet");
  const hasKitchen = objects.some(o => o.type === "kitchen");
  const hasExercise = objects.some(o => o.type === "exercise");
  const hasPrivate = objects.some(o => o.type === "private");

  if (!hasBed) suggestions.push({ type: "hint", msg: "Add at least a Bed for sleeping." });
  if (!hasPanel) suggestions.push({ type: "hint", msg: "Add a Panel for control systems." });
  if (!hasCabinet) suggestions.push({ type: "hint", msg: "Add a Cabinet for storage." });
  if (!hasKitchen) suggestions.push({ type: "hint", msg: "Add a Kitchen for food preparation." });
  if (!hasExercise) suggestions.push({ type: "hint", msg: "Add an Exercise area for crew health." });
  if (!hasPrivate) suggestions.push({ type: "hint", msg: "Add Private Space for psychological comfort." });

  // Завжди додаємо приклад перевірки правил
  suggestions.push({ type: "hint", msg: "Ensure corridors are clear for movement." });

  res.json(suggestions);
});

app.listen(PORT, () => {
  console.log(`AI server listening at http://localhost:${PORT}`);
});
