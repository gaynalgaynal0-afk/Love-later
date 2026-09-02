import express from "express";
import multer from "multer";

const app = express();
const port = process.env.PORT || 10000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

async function transcribeAudio(buffer, mimetype) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimetype || "audio/webm" }), "voice.webm");
  form.append("model", "whisper-large-v3-turbo");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Groq transcription error:", errText);
    throw new Error("Transcription failed");
  }

  const data = await res.json();
  return (data.text || "").toLowerCase();
}

function containsILoveYou(text) {
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /\bi\s+love\s+you\b/.test(normalized) || /\beye\s+love\s+you\b/.test(normalized);
}

app.post("/api/send-voice", upload.single("voice"), async (req, res) => {
  try {
    if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
      return res.status(500).json({ ok: false, error: "Telegram environment variables are not configured." });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No voice recording received." });
    }

    console.log("GROQ_API_KEY present:", !!GROQ_API_KEY);

    if (GROQ_API_KEY) {
      let transcript = "";
      try {
        transcript = await transcribeAudio(req.file.buffer, req.file.mimetype);
        console.log("Transcript received:", JSON.stringify(transcript));
      } catch (err) {
        console.error("Transcription error:", err);
        return res.status(502).json({ ok: false, error: "Couldn't verify the recording. Please try again." });
      }

      const matched = containsILoveYou(transcript);
      console.log("Phrase matched:", matched);

      if (!matched) {
        return res.status(422).json({
          ok: false,
          error: "I couldn't hear \u201cI love you\u201d in that recording. Please try again, speaking clearly."
        });
      }
    } else {
      console.log("Skipping verification: GROQ_API_KEY not set");
    }

    const form = new FormData();
    form.append("chat_id", ADMIN_CHAT_ID);
    form.append("voice", new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" }), "i-love-you.webm");
    form.append("caption", "💌 New 'I love you' voice note from the love-letter website.");

    const tg = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVoice`, {
      method: "POST",
      body: form
    });

    const data = await tg.json();
    if (!tg.ok || !data.ok) {
      console.error("Telegram error:", data);
      return res.status(502).json({ ok: false, error: "Telegram could not receive the voice note." });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error while sending the voice note." });
  }
});

app.get("/*splat", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(process.cwd() + "/public/index.html");
});

app.listen(port, () => console.log(`Love-letter app running on port ${port}`));
