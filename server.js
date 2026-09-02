import express from "express";
import multer from "multer";

const app = express();
const port = process.env.PORT || 10000;

const BOT_TOKEN = process.env.BOT_TOKENE;
const ADMIN_CHAT_ID = process.env.7213598939;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/send-voice", upload.single("voice"), async (req, res) => {
  try {
    if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
      return res.status(500).json({ ok: false, error: "Telegram environment variables are not configured." });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No voice recording received." });
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

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(process.cwd() + "/public/index.html");
});

app.listen(port, () => console.log(`Love-letter app running on port ${port}`));
