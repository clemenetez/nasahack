import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
const PORT = 5000;

app.use(cors()); // дозволяємо CORS для всіх доменів
app.use(bodyParser.json());

// Замініть на свій реальний Gemini API Key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDh-wxUUl1-fktdTQMB8h1XS63afcXu6oc";

// ---------------- Helper: prompt generation ----------------
function generatePrompt(layout) {
  const activeModule = layout.activeModule || {};
  const objects = layout.objects || [];

  let text = `You are an AI assistant helping design a 2D space habitat. Evaluate the layout and provide actionable suggestions in short sentences in English. Only output suggestions, one per line. Do not explain or add extra text.\n\n`;
  text += `Active module dimensions: ${activeModule.w}x${activeModule.h}\n`;
  text += `Corridor: ${JSON.stringify(activeModule.corridor)}\n`;
  text += `Objects in the module:\n`;
  for (const o of objects) {
    text += `- ${o.type} at (${o.x},${o.y}) size ${o.w}x${o.h}\n`;
  }
  text += `\nProvide suggestions for better placement, accessibility, and free space.`;
  return text;
}

// ---------------- Helper: call Gemini API ----------------
async function sendToGemini(prompt) {
  const response = await fetch("https://api.gemini.com/v1/assistant", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GEMINI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gemini-1.5",
      prompt,
      temperature: 0.5,
      max_tokens: 300
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  // В залежності від формату Gemini, підлаштуй:
  // може бути data.text або data.choices[0].message.content
  return data?.text || data?.choices?.[0]?.message?.content || "";
}

// ---------------- API endpoint ----------------
app.post("/api/ai/suggest", async (req, res) => {
  const layout = req.body.layout;
  if (!layout) return res.status(400).json([{ type: "error", msg: "No layout provided" }]);

  try {
    const prompt = generatePrompt(layout);
    const aiText = await sendToGemini(prompt);

    const suggestions = aiText
      .split("\n")
      .filter(line => line.trim())
      .map(msg => ({ type: "hint", msg }));

    res.json(suggestions);
  } catch (err) {
    console.error(err);
    // Завжди повертаємо масив, навіть при помилці
    res.status(500).json([{ type: "error", msg: err.message }]);
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
