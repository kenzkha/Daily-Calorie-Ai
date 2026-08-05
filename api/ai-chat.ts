import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { history, message, language = "id" } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        text: "⚠️ **GEMINI_API_KEY belum dipasang di Vercel.**\n\nUntuk mengaktifkan Jarvis AI di Vercel:\n1. Buka **Vercel Dashboard** -> pilih project `daily-calorie-ai`\n2. Buka menu **Settings** -> **Environment Variables**\n3. Tambahkan Variable Name: `GEMINI_API_KEY` dan Value: API key dari Google AI Studio (https://aistudio.google.com/app/apikey)\n4. Lakukan **Redeploy** (Deploy ulang) project Anda di Vercel."
      });
    }

    const ai = new GoogleGenAI({ apiKey });

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
    const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
    let response: any = null;
    let lastErr: any = null;

    for (const model of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: formattedContents,
          config: {
            systemInstruction: `Anda adalah Jarvis, asisten kesehatan AI yang ramah, informatif, dan pintar. Jawab dengan bahasa ${targetLang} yang santai, ringkas (maksimal 3 paragraf), dan fokus pada gaya hidup sehat, nutrisi, resep diet, dan olahraga.`,
          },
        });
        if (response) break;
      } catch (e: any) {
        console.warn(`Model ${model} failed in Vercel ai-chat:`, e?.message);
        lastErr = e;
      }
    }

    if (!response) {
      throw lastErr || new Error("Gagal mendapatkan balasan dari Gemini AI.");
    }

    return res.status(200).json({ text: response.text || "Maaf, saya sedang tidak fokus. Bisa ulangi pertanyaannya?" });
  } catch (error: any) {
    console.error("Error in Vercel /api/ai-chat:", error);
    return res.status(500).json({ error: error.message || "Gagal menghubungi Jarvis AI." });
  }
}
