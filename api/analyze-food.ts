import { GoogleGenAI, Type } from "@google/genai";

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: "GEMINI_API_KEY belum dipasang di Vercel. Silakan tambahkan GEMINI_API_KEY di Vercel Settings -> Environment Variables, lalu Redeploy."
      });
    }

    const ai = new GoogleGenAI({ apiKey });
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

    if (!response) {
      throw lastErr || new Error("Gagal memproses gambar dengan Gemini AI");
    }

    const text = response.text;
    if (!text) {
      throw new Error("Tidak ada respon teks dari Gemini AI");
    }

    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error("Error in Vercel /api/analyze-food:", error);
    return res.status(500).json({ error: error.message || "Gagal menganalisis gambar makanan." });
  }
}
