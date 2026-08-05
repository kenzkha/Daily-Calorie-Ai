import { GoogleGenAI, Type } from "@google/genai";

async function callGroqVision(imageBase64: string, groqApiKey: string) {
  const models = ["llama-3.2-11b-vision-preview", "llama-3.2-90b-vision-preview"];
  const formattedUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const promptText = `Analisis gambar ini. Apakah ini gambar makanan/minuman? Jika ya, estimasi nama (Indonesia), kalori(kkal), protein(g), karbohidrat(g), lemak(g). Jika bukan makanan/minuman, atur isFood menjadi false.\n\nKembalikan HANYA format JSON valid berikut tanpa markdown:\n{\n  "name": "nama makanan",\n  "calories": 150,\n  "protein": 10,\n  "carbs": 20,\n  "fat": 5,\n  "isFood": true\n}`;

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
          response_format: { type: "json_object" },
          temperature: 0.2
        })
      });

      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`Groq vision status ${res.status}: ${errTxt}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      const cleanJson = content.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (err: any) {
      console.warn(`Groq vision model ${model} failed:`, err?.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error("Gagal memproses gambar makanan dengan Groq Vision AI.");
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

    // Try Groq directly if no Gemini key
    if (groqKey && !geminiKey) {
      const parsed = await callGroqVision(imageBase64, groqKey);
      return res.status(200).json(parsed);
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

      // Gemini failed/rate-limited -> Fallback to Groq if key exists!
      if (groqKey) {
        console.warn("Gemini vision failed or rate limited. Falling back to Groq Vision...");
        try {
          const parsed = await callGroqVision(imageBase64, groqKey);
          return res.status(200).json(parsed);
        } catch (groqErr) {
          console.error("Groq vision fallback failed:", groqErr);
        }
      }

      const errStr = typeof lastErr === "string" ? lastErr : JSON.stringify(lastErr || {}) + " " + (lastErr?.message || "");
      if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("429") || lastErr?.status === "RESOURCE_EXHAUSTED" || lastErr?.code === 429) {
        return res.status(429).json({
          error: "⚠️ Batas kuota gratis Gemini AI terlampaui. Tambahkan GROQ_API_KEY gratis dari https://console.groq.com/keys di Vercel agar analisis gambar selalu berjalan lancar, atau tunggu 30-60 detik."
        });
      }
      throw lastErr || new Error("Gagal memproses gambar dengan Gemini AI");
    }

    if (groqKey) {
      const parsed = await callGroqVision(imageBase64, groqKey);
      return res.status(200).json(parsed);
    }

    return res.status(500).json({ error: "No available AI provider." });
  } catch (error: any) {
    console.error("Error in Vercel /api/analyze-food:", error);
    const errStr = typeof error === "string" ? error : JSON.stringify(error || {}) + " " + (error?.message || "");
    if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429) {
      return res.status(429).json({
        error: "⚠️ Batas kuota gratis Gemini AI terlampaui. Silakan tunggu 30 - 60 detik atau tambahkan GROQ_API_KEY di Vercel."
      });
    }
    return res.status(500).json({ error: error?.message || "Gagal menganalisis gambar makanan." });
  }
}
