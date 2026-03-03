// /api/chat.js - Gemini (OpenAI-compatible) chat/completions
// Persona karışmasını önlemek için LOCKED_ASSISTANT desteği eklenmiştir.

export default async function handler(req, res) {
  // (Opsiyonel) CORS gerekiyorsa aç:
  // res.setHeader("Access-Control-Allow-Origin", "*");
  // res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  // res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Only POST method allowed" });
  }

  try {
    // Body: string veya object gelebilir
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error("JSON parse error:", e);
        return res.status(400).json({ reply: "Invalid JSON format in request body." });
      }
    }

    const { message, history = [], assistant } = body;

    if (!message) {
      return res.status(400).json({ reply: "Mesaj içeriği bulunamadı." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY eksik");
      return res.status(500).json({
        reply: "Sunucu yapılandırma hatası: GEMINI_API_KEY tanımlı değil.",
      });
    }

    // -----------------------------
    // 1) Persona seçimi (karışmayı önleme)
    // -----------------------------
    const LOCKED = (process.env.LOCKED_ASSISTANT || "").trim(); // "eren_cv" | "ebrar_ai" | ""
    const personaKey = LOCKED || (assistant || "eren_cv");

    const PERSONAS = {
      eren_cv: {
        systemPrompt:
          "Sen Eren Kayalı’nın CV asistanısın. " +
          "Eren, İstanbul Medeniyet Üniversitesi İşletme mezunu; bağımsız denetim alanında Denetim Asistanı olarak çalışmıştır. " +
          "RSM İstanbul: 08/2025 – Devam ediyor. " +
          "Bilgin Global Bağımsız Denetim: 10/2024 – 02/2025. " +
          "Boğaziçi YMM: KDV İade Bölümü: 08/2024 – 10/2024. " +
          "Ozt Lojistik: Ön Muhasebe Stajyeri: 07/2022 – 08/2022. " +
          "Denetimde: nakit/banka, ticari alacak/borç, stok, maddi duran varlık hesaplarında testler; mutabakat, teyit ve stok sayımı; working papers ve finansal analiz deneyimi vardır. " +
          "Yetenekler: Excel, Microsoft Office, SAP, SAS, İngilizce (B2). " +
          "SGS (SMMM Staja Giriş Sınavı) için hazırlanmaktadır. " +
          "Cevapların: kısa, net, CV’ye uygun ve profesyonel olsun. İstenirse TR/EN iki dilde cevap verebilirsin. " +
          "Mülakat sorularında STAR formatında (Durum-Görev-Aksiyon-Sonuç) yanıt öner.",
      },

    
      ebrar_ai: {
        systemPrompt:
          "Sen Ebrar Albayrak’ın kişisel yapay zekâ asistanısın. " +
          "Ebrar, DevOps, backend development, Docker, Jenkins, CI/CD, FastAPI, SQLAlchemy, PostgreSQL ve bağımsız denetim (audit automation) " +
          "konularında deneyimli bir bilgisayar mühendisidir. " +
          "Cevaplarında sakin, profesyonel, net ve akıcı ol. Teknik sorulara ayrıntılı, gündelik sorulara doğal ama kurumsal üslupta yanıt ver. " +
          "Gerektiğinde kısa örnek kodlar, mimari özetler ve pratik öneriler sun.",
      },
    };

    const persona = PERSONAS[personaKey];
    if (!persona) {
      // Kilitli değilse ve yanlış persona geldiyse: 400 dönelim ki karışma olmasın
      return res.status(400).json({
        reply: `Geçersiz assistant/persona: "${personaKey}". İzin verilenler: ${Object.keys(PERSONAS).join(", ")}`,
      });
    }

  
    const safeHistory = Array.isArray(history)
      ? history
          .filter((m) => m && typeof m === "object" && m.role && m.content)
          // history içinden "system" sokulmasını engelle
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-20) // token şişmesini engellemek için son 20 mesaj
          .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content),
          }))
      : [];

    const messages = [
      { role: "system", content: persona.systemPrompt },
      ...safeHistory,
      { role: "user", content: String(message) },
    ];

    /
    const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"; 
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
      }),
    });

    const json = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error("Gemini API error:", geminiRes.status, json);
      return res.status(500).json({
        reply: `Modelden yanıt alınamadı. (Gemini hata kodu: ${geminiRes.status})`,
      });
    }


    let reply =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.message?.parts?.map((p) => p?.text || "").join(" ");

    reply = (reply || "").toString().trim() || "Model boş yanıt döndürdü.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({
      reply: "Sunucu tarafında bir hata oluştu: " + (err?.message || "Bilinmeyen hata."),
    });
  }
}
