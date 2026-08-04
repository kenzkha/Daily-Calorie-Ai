import { GoogleGenAI, Type } from "@google/genai";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "20mb" }));

// Lazy get Gemini client
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// 1. Food Image Analysis API Route
app.post("/api/analyze-food", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Image data is required" });
    }

    const ai = getGenAI();
    // Clean up base64 prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Analisis gambar ini. Apakah ini gambar makanan/minuman? Jika ya, estimasi nama (Indonesia), kalori(kkal), protein(g), karbohidrat(g), lemak(g). Jika bukan makanan/minuman, atur isFood menjadi false.",
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            calories: { type: Type.INTEGER },
            protein: { type: Type.INTEGER },
            carbs: { type: Type.INTEGER },
            fat: { type: Type.INTEGER },
            isFood: { type: Type.BOOLEAN },
          },
          required: ["name", "calories", "protein", "carbs", "fat", "isFood"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response text from Gemini");
    }

    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error("Error in /api/analyze-food:", error);
    return res.status(500).json({ error: error.message || "Failed to analyze image" });
  }
});

// 2. AI Health Chat API Route
app.post("/api/ai-chat", async (req, res) => {
  try {
    const { history, message, language = "id" } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const ai = getGenAI();

    // Format history for SDK
    const formattedContents = (history || []).map((msg: any) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.text }],
    }));

    formattedContents.push({
      role: "user",
      parts: [{ text: message }],
    });

    const langMap: Record<string, string> = {
      id: "Indonesia",
      en: "English",
      zh: "中文",
      ja: "日本語",
      de: "Deutsch",
      fr: "Français",
      hi: "हिन्दी",
      ko: "한국어",
      pt: "Português",
      es: "Español",
    };

    const targetLang = langMap[language] || "Indonesia";

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: formattedContents,
      config: {
        systemInstruction: `Anda adalah Jarvis, asisten kesehatan AI yang ramah, informatif, dan pintar. Jawab dengan bahasa ${targetLang} yang santai, ringkas (maksimal 3 paragraf), dan fokus pada gaya hidup sehat, nutrisi, resep diet, dan olahraga.`,
      },
    });

    return res.json({ text: response.text || "Maaf, saya sedang tidak fokus. Bisa ulangi pertanyaannya?" });
  } catch (error: any) {
    console.error("Error in /api/ai-chat:", error);
    return res.status(500).json({ error: error.message || "Gagal menghubungi Jarvis AI." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
