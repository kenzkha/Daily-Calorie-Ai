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

// Helper to safely parse JSON response from Groq AI models
function parseNutritionJson(rawContent: string) {
  let content = rawContent.trim();
  // Strip markdown code fences if present (```json ... ``` or ``` ...)
  content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: any = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (err) {
        console.warn("Regex JSON match parse failed:", err);
      }
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Gagal membaca format data nutrisi dari Groq AI.");
  }

  return {
    name: String(parsed.name || "Makanan/Minuman").trim(),
    calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
    protein: Math.max(0, Math.round(Number(parsed.protein) || 0)),
    carbs: Math.max(0, Math.round(Number(parsed.carbs) || 0)),
    fat: Math.max(0, Math.round(Number(parsed.fat) || 0)),
    healthTip: String(
      parsed.healthTip ||
      "Porsi makanan seimbang. Pastikan mencukupi kebutuhan cairan air putih harian Anda."
    ).trim(),
    isFood: parsed.isFood !== false,
  };
}

async function callGroqChat(history: any[], message: string, systemInstruction: string, groqApiKey: string) {
  const models = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it"
  ];
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

async function callGroqNutritionText(text: string, groqApiKey: string) {
  const models = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it"
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

Kembalikan HANYA format JSON valid tanpa teks lain:
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
      return parseNutritionJson(content);
    } catch (err: any) {
      console.warn(`Groq text model ${model} failed:`, err?.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error("Gagal menghitung nutrisi dengan Groq AI");
}

async function getGroqVisionModels(groqApiKey: string): Promise<string[]> {
  const fallbackModels = [
    "llama-3.2-11b-vision-preview",
    "llama-3.2-90b-vision-preview",
    "llama-3.2-11b-vision-instruct",
    "llama-3.2-90b-vision-instruct",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "qwen/qwen3.6-27b",
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

  const promptText = `Analisis gambar ini. Apakah ini gambar makanan/minuman? Jika ya, estimasi nama (Indonesia), kalori(kkal), protein(g), karbohidrat(g), lemak(g), dan berikan 1-2 kalimat saran kesehatan & nutrisi singkat yang relevan. Jika bukan makanan/minuman, atur isFood menjadi false.\n\nKembalikan HANYA JSON valid tanpa teks atau markdown lain:\n{\n  "name": "Nasi Goreng",\n  "calories": 350,\n  "protein": 12,\n  "carbs": 45,\n  "fat": 10,\n  "healthTip": "Perhatikan porsi minyak. Seimbangkan dengan tambahkan sayuran atau telur dadar tinggi protein.",\n  "isFood": true\n}`;

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
      return parseNutritionJson(content);
    } catch (err: any) {
      console.warn(`Groq vision model ${model} failed:`, err?.message);
      allErrors.push(err?.message || String(err));
    }
  }
  throw new Error(allErrors.slice(0, 2).join(" | "));
}

// 1. Food Image Analysis API Route (Exclusively Groq Vision)
app.post(["/api/analyze-food", "/analyze-food"], async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "Image data is required" });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.status(400).json({
        error: "GROQ_API_KEY belum dipasang. Silakan tambahkan GROQ_API_KEY di Environment Variables (dapatkan gratis di https://console.groq.com/keys)."
      });
    }

    const parsed = await callGroqVision(imageBase64, groqKey);
    return res.json(parsed);
  } catch (error: any) {
    console.error("Error in /api/analyze-food:", error);
    return res.status(500).json({
      error: `⚠️ Analisis foto dengan Groq AI gagal: ${error?.message || "Terjadi kendala jaringan ke Groq AI."}`
    });
  }
});

// 2. Food Text Nutrition Analysis & Calculator API Route (Exclusively Groq AI)
app.post(["/api/analyze-food-text", "/analyze-food-text"], async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Deskripsi makanan atau minuman harus diisi." });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.status(400).json({
        error: "GROQ_API_KEY belum dipasang. Silakan tambahkan GROQ_API_KEY di Environment Variables (gratis di https://console.groq.com/keys)."
      });
    }

    const parsed = await callGroqNutritionText(text.trim(), groqKey);
    return res.json(parsed);
  } catch (error: any) {
    console.error("Error in /api/analyze-food-text:", error);
    return res.status(500).json({ error: error?.message || "Gagal menghitung nutrisi makanan dengan Groq AI." });
  }
});

// 3. AI Health Chat API Route (Exclusively Groq AI)
app.post(["/api/ai-chat", "/ai-chat"], async (req, res) => {
  try {
    const { history, message, language = "id" } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.json({
        text: "⚠️ **GROQ_API_KEY Belum Dipasang.**\n\nSilakan pasang `GROQ_API_KEY` (gratis di https://console.groq.com/keys) di Environment Variables agar Jarvis AI dapat langsung membalas pertanyaan Anda."
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

    const text = await callGroqChat(history, message, systemInstruction, groqKey);
    return res.json({ text });
  } catch (error: any) {
    console.error("Error in /api/ai-chat:", error);
    return res.status(500).json({ error: error?.message || "Gagal menghubungi Jarvis AI melalui Groq API." });
  }
});

// App Access & Visitor Counter State
let memoryAccessStats = {
  totalVisits: 1420,
  uniqueUsers: 685,
  lastUpdated: new Date().toISOString(),
};

// 4. App Access Counter Routes
app.get(["/api/app-visits", "/app-visits"], (req, res) => {
  return res.json({
    success: true,
    totalVisits: memoryAccessStats.totalVisits,
    uniqueUsers: memoryAccessStats.uniqueUsers,
    lastUpdated: memoryAccessStats.lastUpdated,
  });
});

app.post(["/api/log-visit", "/log-visit"], (req, res) => {
  const { isNewUser } = req.body || {};
  memoryAccessStats.totalVisits += 1;
  if (isNewUser) {
    memoryAccessStats.uniqueUsers += 1;
  }
  memoryAccessStats.lastUpdated = new Date().toISOString();

  return res.json({
    success: true,
    totalVisits: memoryAccessStats.totalVisits,
    uniqueUsers: memoryAccessStats.uniqueUsers,
  });
});

// 5. Google Drive User Registration Logging Route
app.post(["/api/log-user", "/log-user"], async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const { accountName, email, method, familyCode } = req.body || {};

    if (!token) {
      return res.status(401).json({ error: "Access token is required" });
    }

    const FILE_NAME = "DailyCal_Pendaftaran_User.csv";
    const CSV_HEADER = "Waktu,Nama Akun,Email,Metode Login,Ruang Keluarga\n";

    // 1. Search for existing file
    const query = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      return res.status(searchRes.status).json({ error: errText });
    }

    const searchData = await searchRes.json();
    const existingFiles = searchData.files || [];

    const now = new Date();
    const formattedDate = now.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const sanitizeCsvField = (str: string = "") => {
      const escaped = String(str).replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const newRow = `${sanitizeCsvField(formattedDate)},${sanitizeCsvField(accountName || "-")},${sanitizeCsvField(email || "-")},${sanitizeCsvField(method || "Email")},${sanitizeCsvField(familyCode || "-")}\n`;

    if (existingFiles.length === 0) {
      // Create new CSV file
      const fullContent = CSV_HEADER + newRow;
      const metadata = {
        name: FILE_NAME,
        mimeType: "text/csv",
        description: "Daftar riwayat pendaftaran dan login pengguna aplikasi DailyCal",
      };

      const boundary = "-------314159265358979323846";
      const delimiter = "\r\n--" + boundary + "\r\n";
      const closeDelim = "\r\n--" + boundary + "--";

      const multipartRequestBody =
        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        "Content-Type: text/csv\r\n\r\n" +
        fullContent +
        closeDelim;

      const createRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );

      if (!createRes.ok) {
        const createErr = await createRes.text();
        return res.status(createRes.status).json({ error: createErr });
      }

      const fileData = await createRes.json();
      return res.json({ success: true, fileId: fileData.id, created: true });
    } else {
      // Append to existing file
      const fileId = existingFiles[0].id;
      const downloadRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      let existingContent = "";
      if (downloadRes.ok) {
        existingContent = await downloadRes.text();
      }

      let updatedContent = existingContent;
      if (!updatedContent.trim().startsWith("Waktu")) {
        updatedContent = CSV_HEADER + updatedContent;
      }
      if (!updatedContent.endsWith("\n") && updatedContent.length > 0) {
        updatedContent += "\n";
      }
      updatedContent += newRow;

      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/csv",
          },
          body: updatedContent,
        }
      );

      if (!updateRes.ok) {
        const updateErr = await updateRes.text();
        return res.status(updateRes.status).json({ error: updateErr });
      }

      return res.json({ success: true, fileId, appended: true });
    }
  } catch (error: any) {
    console.error("Error in /api/log-user:", error);
    return res.status(500).json({ error: error?.message || "Gagal mencatat data ke Google Drive" });
  }
});

// 5. Google Drive View Registered Users Route
app.get(["/api/registered-users", "/registered-users"], async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Access token is required" });
    }

    const FILE_NAME = "DailyCal_Pendaftaran_User.csv";
    const query = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!searchRes.ok) {
      return res.status(searchRes.status).json({ error: "Failed to search Drive files" });
    }

    const searchData = await searchRes.json();
    const existingFiles = searchData.files || [];

    if (existingFiles.length === 0) {
      return res.json({ total: 0, entries: [], fileId: null, webViewLink: null });
    }

    const file = existingFiles[0];
    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!downloadRes.ok) {
      return res.json({ total: 0, entries: [], fileId: file.id, webViewLink: file.webViewLink });
    }

    const content = await downloadRes.text();
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    const entries = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
      const cleanCols = (match || line.split(",")).map((c) => c.replace(/^"|"$/g, "").trim());
      if (cleanCols.length >= 2) {
        entries.push({
          time: cleanCols[0] || "-",
          name: cleanCols[1] || "-",
          email: cleanCols[2] || "-",
          method: cleanCols[3] || "-",
          family: cleanCols[4] || "-",
        });
      }
    }

    return res.json({
      total: entries.length,
      entries: entries.reverse(),
      fileId: file.id,
      webViewLink: file.webViewLink,
    });
  } catch (error: any) {
    console.error("Error in /api/registered-users:", error);
    return res.status(500).json({ error: error?.message || "Failed to fetch Drive users" });
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

