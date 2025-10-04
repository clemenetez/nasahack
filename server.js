import express from "express";
import cors from "cors";

const app = express();
const PORT = 5500;

// Middlewares
app.use(cors());
app.use(express.json()); // щоб читати JSON body

// POST /api/ai/suggest
app.post("/api/ai/suggest", (req, res) => {
  const layout = req.body.layout || {};
  const activeModule = layout.activeModule || {};
  const objects = activeModule.objects || [];

  console.log("Received objects:", objects);

  const suggestions = [];

  if (objects.length === 0) {
    // Якщо об’єктів немає — базові підказки
    suggestions.push({
      category: "General",
      importance: "high",
      short: "Empty layout",
      detail: "No objects found in the active module. Add some to get meaningful suggestions."
    });
  } else {
    // Для кожного об’єкта формуємо "Gemini"-структуру
    objects.forEach(o => {
      suggestions.push({
        category: "Object",
        importance: "medium",
        short: `Found ${o.type}`,
        detail: `Object "${o.type}" at (${o.x},${o.y}), size: ${o.w}x${o.h}`
      });

      // Додаткові Geminі-поради
      if (o.type === "bed") {
        suggestions.push({
          category: "Advice",
          importance: "high",
          short: "Bed placement",
          detail: "Consider placing the bed away from noisy panels for better crew rest."
        });
      }
      if (o.type === "kitchen") {
        suggestions.push({
          category: "Advice",
          importance: "medium",
          short: "Kitchen proximity",
          detail: "Keep the kitchen near the dining area for efficiency."
        });
      }
    });
  }

  res.json(suggestions);
});

// Health check
app.get("/api/health", (req, res) => {
  res.send({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`AI server running at http://localhost:${PORT}`);
});
