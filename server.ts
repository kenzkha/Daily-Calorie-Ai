import { GoogleGenAI, Type } from "@google/genai";
import express from "express";
import path from "path";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "20mb" }));

// CORS middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Lazy get Gemini client
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi. Pastikan GEMINI_API_KEY sudah ditambahkan di Vercel Settings -> Environment Variables.");
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

async function callGroqChat(history: any[], message: string, systemInstruction: string, groqApiKey: string) {
  const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
  const messages = [
    { role: "system", content: systemInstruction },
    ...(history || []).map((msg: any) => ({
      role: msg.role === "model" || msg.role === "assistant" ? "assistant" : "user",
      content: msg.text || msg.content || ""
    })),
    { role: "user", content: message }
  ];

  let lastErr: any = null;
  for (const model of models) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7
        })
      });

      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`Groq status ${res.status}: ${errTxt}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) return content;
    } catch (err: any) {
      console.warn(`Groq chat model ${model} failed:`, err?.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error("Gagal mendapatkan balasan dari Groq AI.");
}

async function callGroqVision(imageBase64: string, groqApiKey: string) {
  const models = ["llama-3.2-11b-vision-preview", "llama-3.2-90b-vision-preview"];
  const formattedUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const promptText = `Analisis gambar ini. Apakah ini gambar makanan/minuman? Jika ya, estimasi nama (Indonesia), kalori(kkal), protein(g), karbohidrat(g), lemak(g). Jika bukan makanan/minuman, atur isFood menjadi false.\n\nKembalikan HANYA JSON valid tanpa teks atau markdown lain:\n{\n  "name": "Nasi Goreng",\n  "calories": 350,\n  "protein": 12,\n  "carbs": 45,\n  "fat": 10,\n  "isFood": true\n}`;

  let lastErr: any = null;
  for (const model of models) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                { type: "image_url", image_url: { url: formattedUrl } }
              ]
            }
          ],
          temperature: 0.1
        })
      });

      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`Groq vision status ${res.status}: ${errTxt}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return JSON.parse(content);
    } catch (err: any) {
      console.warn(`Groq vision model ${model} failed:`, err?.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error("Gagal memproses gambar makanan dengan Groq Vision AI.");
}

// 1. Food Image Analysis API Route
app.post(["/api/analyze-food", "/analyze-food"], async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "Image data is required" });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return res.status(400).json({
        error: "GROQ_API_KEY atau GEMINI_API_KEY belum dipasang. Silakan tambahkan di Vercel Settings -> Environment Variables."
      });
    }

    if (groqKey) {
      try {
        const parsed = await callGroqVision(imageBase64, groqKey);
        return res.json(parsed);
      } catch (groqErr) {
        console.warn("Groq vision failed, trying Gemini if key available:", groqErr);
      }
    }

    if (geminiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
      let response: any = null;
      let lastErr: any = null;

      for (const model of modelsToTry) {
        try {
          response = await ai.models.generateContent({
            model,
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
          if (response) break;
        } catch (e: any) {
          console.warn(`Model ${model} failed in analyze-food:`, e?.message);
          lastErr = e;
        }
      }

      if (response?.text) {
        const parsed = JSON.parse(response.text);
        return res.json(parsed);
      }

      const errStr = typeof lastErr === "string" ? lastErr : JSON.stringify(lastErr || {}) + " " + (lastErr?.message || "");
      if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("429") || lastErr?.status === "RESOURCE_EXHAUSTED" || lastErr?.code === 429) {
        return res.status(429).json({
          error: "⚠️ Batas kuota gratis Gemini AI terlampaui. Silakan REDEPLOY project Anda di Vercel setelah memasukkan GROQ_API_KEY."
        });
      }
      throw lastErr || new Error("Gagal memproses gambar dengan Gemini AI");
    }

    return res.status(500).json({ error: "No available AI provider." });
  } catch (error: any) {
    console.error("Error in /api/analyze-food:", error);
    const errStr = typeof error === "string" ? error : JSON.stringify(error || {}) + " " + (error?.message || "");
    if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429) {
      return res.status(429).json({
        error: "⚠️ Batas kuota gratis Gemini AI terlampaui. Silakan tunggu 30 - 60 detik atau tambahkan GROQ_API_KEY di Vercel."
      });
    }
    return res.status(500).json({ error: error?.message || "Gagal menganalisis gambar makanan." });
  }
});

// 2. AI Health Chat API Route
app.post(["/api/ai-chat", "/ai-chat"], async (req, res) => {
  try {
    const { history, message, language = "id" } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return res.json({
        text: "⚠️ **API Key AI Belum Dipasang.**\n\nSilakan pasang `GROQ_API_KEY` (gratis di https://console.groq.com/keys) atau `GEMINI_API_KEY` di Environment Variables."
      });
    }

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
    const systemInstruction = `Anda adalah Jarvis, asisten kesehatan AI yang ramah, informatif, dan pintar. Jawab dengan bahasa ${targetLang} yang santai, ringkas (maksimal 3 paragraf), dan fokus pada gaya hidup sehat, nutrisi, resep diet, dan olahraga.`;

    if (groqKey && !geminiKey) {
      const text = await callGroqChat(history, message, systemInstruction, groqKey);
      return res.json({ text });
    }

    if (geminiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const formattedContents = (history || []).map((msg: any) => ({
        role: msg.role === "model" ? "model" : "user",
        parts: [{ text: msg.text }],
      }));

      formattedContents.push({
        role: "user",
        parts: [{ text: message }],
      });

      const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
      let response: any = null;
      let lastErr: any = null;

      for (const model of modelsToTry) {
        try {
          response = await ai.models.generateContent({
            model,
            contents: formattedContents,
            config: { systemInstruction },
          });
          if (response) break;
        } catch (e: any) {
          console.warn(`Model ${model} failed in ai-chat:`, e?.message);
          lastErr = e;
        }
      }

      if (response?.text) {
        return res.json({ text: response.text });
      }

      if (groqKey) {
        console.warn("Gemini chat failed or rate limited. Falling back to Groq AI...");
        try {
          const text = await callGroqChat(history, message, systemInstruction, groqKey);
          return res.json({ text });
        } catch (groqErr) {
          console.error("Groq chat fallback failed:", groqErr);
        }
      }

      const errStr = typeof lastErr === "string" ? lastErr : JSON.stringify(lastErr || {}) + " " + (lastErr?.message || "");
      if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("429") || lastErr?.status === "RESOURCE_EXHAUSTED" || lastErr?.code === 429) {
        return res.json({
          text: "⏳ **Batas Kuota Penggunaan Gemini AI Terlampaui**\n\nUntuk respon AI tanpa hambatan, Anda dapat memasang **GROQ_API_KEY** (gratis di https://console.groq.com/keys) di Environment Variables Vercel.\n\nAtau tunggu 30-60 detik."
        });
      }
      throw lastErr || new Error("Gagal mendapatkan balasan dari Gemini AI");
    }

    if (groqKey) {
      const text = await callGroqChat(history, message, systemInstruction, groqKey);
      return res.json({ text });
    }

    return res.status(500).json({ error: "No available AI provider." });
  } catch (error: any) {
    console.error("Error in /api/ai-chat:", error);
    const errStr = typeof error === "string" ? error : JSON.stringify(error || {}) + " " + (error?.message || "");
    if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429) {
      return res.json({
        text: "⏳ **Batas Kuota Penggunaan Gemini AI Terlampaui**\n\nAnda dapat memasang **GROQ_API_KEY** gratis di Vercel agar Jarvis AI selalu merespon tanpa terkena rate limit."
      });
    }
    return res.status(500).json({ error: error?.message || "Gagal menghubungi Jarvis AI." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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

export default app;

if (!process.env.VERCEL) {
  startServer();
}

