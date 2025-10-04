// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch"; // якщо Node <18, інакше можна без нього

const app = express();
app.use(cors()); // дозволяємо запити з будь-якого походження
app.use(express.json());

const GEMINI_API_KEY = "AIzaSyDh-wxUUl1-fktdTQMB8h1XS63afcXu6oc"; // встав свій ключ
const GEMINI_URL = "https://api.gemini.com/v1/ai"; // заміни на актуальний endpoint

// Функція для генерації промпта для Gemini на основі layout
function generatePrompt(layout) {
  const { activeModule, objects } = layout;
  let prompt = `You are an AI assistant that reviews 2D habitat layouts.\n`;
  prompt += `Module: ${activeModule.name}, size ${activeModule.w}x${activeModule.h}, corridor at x:${activeModule.corridor.x}, y:${activeModule.corridor.y}, w:${activeModule.corridor.w}, h:${activeModule.corridor.h}\n`;
  prompt += `Objects in module:\n`;
  objects.forEach(o => {
    prompt += `- ${o.type} at x:${o.x}, y:${o.y}, w:${o.w}, h:${o.h}\n`;
  });
  prompt += `\nProvide suggestions in English for better placement, avoiding overlaps, corridor obstruction, and access zone issues. Use concise bullet points.`;
  return prompt;
}

// Функція для відправки промпта в Gemini
async function sendToGemini(prompt) {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GEMINI_API_KEY}`
    },
    body: JSON.stringify({
      prompt: prompt,
      max_tokens: 200
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${errText}`);
  }

  const data = await response.json();
  // Припустимо Gemini повертає текст у data.text
  return data.text || "No suggestions returned";
}

// Маршрут для отримання підказок
app.post("/api/ai/suggest", async (req, res) => {
  const layout = req.body.layout;
  if (!layout) return res.status(400).json({ error: "No layout provided" });

  try {
    const prompt = generatePrompt(layout);
    const aiText = await sendToGemini(prompt);

    // Розділяємо на окремі підказки (можна адаптувати)
    const suggestions = aiText.split("\n").filter(line => line.trim()).map(msg => ({ type: "hint", msg }));

    res.json(suggestions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
