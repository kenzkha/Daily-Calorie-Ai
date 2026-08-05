import { GoogleGenAI, Type } from "@google/genai";

async function getGroqVisionModels(groqApiKey: string): Promise<string[]> {
  const fallbackModels = [
    "llama-3.2-11b-vision-instruct",
    "llama-3.2-90b-vision-instruct",
    "qwen/qwen3.6-27b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "llama-3.2-11b-vision",
    "llama-3.2-90b-vision"
  ];

  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${groqApiKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.data)) {
        const activeIds: string[] = data.data.map((m: any) => m.id);
        const visionModels = activeIds.filter((id: string) => {
          const lower = id.toLowerCase();
          return (
            lower.includes("vision") ||
            lower.includes("-vl") ||
            lower.includes("scout") ||
            lower.includes("maverick") ||
            lower.includes("qwen3.6")
          );
        });
        if (visionModels.length > 0) {
          return Array.from(new Set([...visionModels, ...fallbackModels]));
        }
      }
    }
  } catch (err) {
    console.warn("Failed to fetch Groq model list dynamically:", err);
  }
  return fallbackModels;
}

async function callGroqVision(imageBase64: string, groqApiKey: string) {
  const models = await getGroqVisionModels(groqApiKey);
  const formattedUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const promptText = `Analisis gambar ini. Apakah ini gambar makanan/minuman? Jika ya, estimasi nama (Indonesia), kalori(kkal), protein(g), karbohidrat(g), lemak(g). Jika bukan makanan/minuman, atur isFood menjadi false.\n\nKembalikan HANYA JSON valid tanpa teks atau markdown lain:\n{\n  "name": "Nasi Goreng",\n  "calories": 350,\n  "protein": 12,\n  "carbs": 45,\n  "fat": 10,\n  "isFood": true\n}`;

  const allErrors: string[] = [];
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
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                { type: "image_url", image_url: { url: formattedUrl } }
              ]
            }
          ],
          max_tokens: 1000,
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
      console.warn(`Groq vision model ${model} failed:`, err?.message);
      allErrors.push(err?.message || String(err));
    }
  }
  throw new Error(allErrors.slice(0, 2).join(" | "));
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

  let groqErrorDetail = "";

  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "Data gambar tidak ditemukan." });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return res.status(400).json({
        error: "GROQ_API_KEY atau GEMINI_API_KEY belum dipasang di Vercel. Silakan tambahkan di Vercel Settings -> Environment Variables, lalu Redeploy."
      });
    }

    // Prioritize Groq if key exists
    if (groqKey) {
      try {
        const parsed = await callGroqVision(imageBase64, groqKey);
        return res.status(200).json(parsed);
      } catch (groqErr: any) {
        groqErrorDetail = groqErr?.message || String(groqErr);
        console.warn("Groq vision failed, trying Gemini if key available:", groqErrorDetail);
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
          console.warn(`Model ${model} failed in Vercel analyze-food:`, e?.message);
          lastErr = e;
        }
      }

      if (response?.text) {
        const parsed = JSON.parse(response.text);
        return res.status(200).json(parsed);
      }

      const errStr = typeof lastErr === "string" ? lastErr : JSON.stringify(lastErr || {}) + " " + (lastErr?.message || "");
      if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("429") || lastErr?.status === "RESOURCE_EXHAUSTED" || lastErr?.code === 429) {
        if (groqKey) {
          return res.status(400).json({
            error: `⚠️ Analisis foto dengan Groq AI gagal (${groqErrorDetail}). Dan kuota Gemini AI juga habis.`
          });
        }
        return res.status(429).json({
          error: "⚠️ Batas kuota gratis Gemini AI terlampaui. Jika sudah memasukkan GROQ_API_KEY di Vercel, pastikan Anda menekan tombol REDEPLOY di Vercel Dashboard agar API Key baru aktif!"
        });
      }
      throw lastErr || new Error("Gagal memproses gambar dengan Gemini AI");
    }

    if (groqErrorDetail) {
      return res.status(400).json({
        error: `⚠️ Groq Vision error: ${groqErrorDetail}`
      });
    }

    return res.status(500).json({ error: "No available AI provider." });
  } catch (error: any) {
    console.error("Error in Vercel /api/analyze-food:", error);
    if (groqErrorDetail) {
      return res.status(400).json({
        error: `⚠️ Analisis foto Groq AI gagal: ${groqErrorDetail}`
      });
    }
    const errStr = typeof error === "string" ? error : JSON.stringify(error || {}) + " " + (error?.message || "");
    if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429) {
      return res.status(429).json({
        error: "⚠️ Batas kuota gratis Gemini AI terlampaui. Silakan REDEPLOY project Anda di Vercel setelah memasukkan GROQ_API_KEY."
      });
    }
    return res.status(500).json({ error: error?.message || "Gagal menganalisis gambar makanan." });
  }
}
