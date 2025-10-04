import express from "express";
import fetch from "node-fetch"; // або використай built-in fetch в Node 20+
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

const GEMINI_API_KEY = "AIzaSyDh-wxUUl1-fktdTQMB8h1XS63afcXu6oc"; // ключ з .env

app.post("/api/ai/suggest", async (req, res) => {
  const layout = req.body.layout;
  if (!layout) return res.status(400).json({ error: "No layout provided" });

  // Генеруємо промпт для Gemini
  const prompt = `
You are a habitat layout assistant. Analyze the following habitat module and suggest improvements in English. 
Provide hints, warnings, and errors for object placement, corridor clearance, access zones, and overall efficiency.

Module layout JSON:
${JSON.stringify(layout, null, 2)}

Return an array of objects: [{type: "hint"|"warn"|"error", msg: "Your suggestion"}]
`;

  try {
    const response = await fetch("https://api.gemini.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-1.5",
        input: prompt,
      }),
    });

    const data = await response.json();
    // Витягуємо текст із Gemini (може бути nested)
    const text = data.output_text || "No suggestions generated";

    // Пробуємо парсити як JSON масив підказок
    let suggestions;
    try {
      suggestions = JSON.parse(text);
    } catch {
      // Якщо не JSON, обертаємо у масив з одним hint
      suggestions = [{ type: "hint", msg: text }];
    }

    res.json(suggestions);
  } catch (err) {
    console.error(err);
    res.status(500).json([{ type: "error", msg: "Failed to contact Gemini API" }]);
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
