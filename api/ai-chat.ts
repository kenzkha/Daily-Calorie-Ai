import { GoogleGenAI } from "@google/genai";

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
          max_tokens: 1024,
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

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return res.status(200).json({
        text: "⚠️ **API Key AI Belum Dipasang di Vercel.**\n\nUntuk mengaktifkan AI Chat di Vercel, tambahkan salah satu API Key berikut:\n\n1. **GROQ_API_KEY** (Gratis & Kuota Tinggi, dapatkan dari [Groq Console](https://console.groq.com/keys))\n2. **GEMINI_API_KEY** (Dapatkan dari [Google AI Studio](https://aistudio.google.com/app/apikey))\n\n**Cara pasang di Vercel:**\nBuka Vercel Dashboard -> project `daily-calorie-ai` -> **Settings** -> **Environment Variables** -> Masukkan `GROQ_API_KEY` atau `GEMINI_API_KEY` -> Lakukan **Redeploy**."
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

    // Try Groq first if key exists (higher rate limit & free tier)
    if (groqKey) {
      try {
        const text = await callGroqChat(history, message, systemInstruction, groqKey);
        return res.status(200).json({ text });
      } catch (groqErr) {
        console.warn("Groq chat failed, falling back to Gemini if available:", groqErr);
      }
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
          console.warn(`Model ${model} failed in Vercel ai-chat:`, e?.message);
          lastErr = e;
        }
      }

      if (response?.text) {
        return res.status(200).json({ text: response.text });
      }

      const errStr = typeof lastErr === "string" ? lastErr : JSON.stringify(lastErr || {}) + " " + (lastErr?.message || "");
      if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("429") || lastErr?.status === "RESOURCE_EXHAUSTED" || lastErr?.code === 429) {
        return res.status(200).json({
          text: "⏳ **Batas Kuota Penggunaan Gemini AI Terlampaui**\n\nJika Anda sudah memasukkan **GROQ_API_KEY** di Vercel, pastikan Anda menekan tombol **REDEPLOY** di Vercel Dashboard agar API Key baru aktif!"
        });
      }
      throw lastErr || new Error("Gagal mendapatkan balasan dari Gemini AI.");
    }

    // Direct Groq attempt if Gemini was skipped
    if (groqKey) {
      const text = await callGroqChat(history, message, systemInstruction, groqKey);
      return res.status(200).json({ text });
    }

    return res.status(500).json({ error: "No available AI provider." });
  } catch (error: any) {
    console.error("Error in Vercel /api/ai-chat:", error);
    const errStr = typeof error === "string" ? error : JSON.stringify(error || {}) + " " + (error?.message || "");
    if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429) {
      return res.status(200).json({
        text: "⏳ **Batas Kuota Penggunaan Gemini AI Terlampaui**\n\nAnda dapat menambahkan **GROQ_API_KEY** gratis dari [Groq Console](https://console.groq.com/keys) ke Vercel agar respon AI tidak pernah terhenti!\n\nAtau tunggu 30-60 detik."
      });
    }
    return res.status(500).json({ error: error?.message || "Gagal menghubungi Jarvis AI." });
  }
}
