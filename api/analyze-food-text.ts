import { GoogleGenAI, Type } from "@google/genai";

async function callGroqNutritionText(text: string, groqApiKey: string) {
  const models = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768"
  ];

  const promptText = `Anda adalah ahli gizi dan nutrisi profesional. Analisis deskripsi makanan/minuman berikut dan estimasi kandungan gizinya secara akurat:
"${text}"

Tentukan:
1. Nama makanan/minuman yang bersih dan rapi (Bahasa Indonesia) beserta porsinya jika relevan.
2. Estimasi Kalori (kkal).
3. Protein (g).
4. Karbohidrat (g).
5. Lemak (g).
6. Saran kesehatan & nutrisi singkat (1-2 kalimat bermanfaat).
7. isFood: true jika merupakan makanan/minuman yang valid untuk dikonsumsi, false jika bukan.

Kembalikan HANYA format JSON valid tanpa format markdown atau teks lain:
{
  "name": "Nasi Goreng Spesial Telur",
  "calories": 380,
  "protein": 14,
  "carbs": 48,
  "fat": 12,
  "healthTip": "Pilihan makanan padat energi. Seimbangkan dengan sayuran segar dan cukupi air putih.",
  "isFood": true
}`;

  let lastErr: any = null;
  for (const model of models) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: promptText }],
          max_tokens: 800,
          temperature: 0.1
        })
      });

      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`Model ${model} (${res.status}): ${errTxt}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return JSON.parse(content);
    } catch (err: any) {
      console.warn(`Groq text model ${model} failed:`, err?.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error("Gagal menghitung nutrisi dengan Groq AI");
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
    const { text } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Deskripsi makanan atau minuman harus diisi." });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return res.status(400).json({
        error: "GROQ_API_KEY atau GEMINI_API_KEY belum dipasang di Vercel. Silakan tambahkan di Vercel Settings -> Environment Variables."
      });
    }

    // Try Groq first if available
    if (groqKey) {
      try {
        const parsed = await callGroqNutritionText(text.trim(), groqKey);
        return res.status(200).json(parsed);
      } catch (groqErr) {
        console.warn("Groq text nutrition failed, trying Gemini...", groqErr);
      }
    }

    // Gemini fallback / primary
    if (geminiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
      let response: any = null;
      let lastErr: any = null;

      const prompt = `Analisis teks makanan/minuman ini: "${text.trim()}". Estimasi nama bersih (Bahasa Indonesia), kalori (kkal), protein (g), karbohidrat (g), lemak (g), dan saran kesehatan singkat (healthTip). Jika teks bukan nama/deskripsi makanan atau minuman, set isFood menjadi false.`;

      for (const model of modelsToTry) {
        try {
          response = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
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
                  healthTip: { type: Type.STRING },
                  isFood: { type: Type.BOOLEAN }
                },
                required: ["name", "calories", "protein", "carbs", "fat", "isFood"]
              }
            }
          });
          if (response) break;
        } catch (e: any) {
          console.warn(`Model ${model} failed in calculate-food-text:`, e?.message);
          lastErr = e;
        }
      }

      if (response?.text) {
        const parsed = JSON.parse(response.text);
        return res.status(200).json(parsed);
      }

      throw lastErr || new Error("Gagal menghitung nutrisi dengan Gemini AI");
    }

    return res.status(500).json({ error: "Tidak ada AI provider yang tersedia." });
  } catch (error: any) {
    console.error("Error in /api/analyze-food-text:", error);
    return res.status(500).json({ error: error?.message || "Gagal menghitung nutrisi makanan." });
  }
}
