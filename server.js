import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const PUBLIC_DIR = path.join(__dirname, "public");
const LETTER_PATH = path.join(__dirname, "private", "letter.pdf");
const STATE_PATH = path.join(__dirname, "data", "state.json");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ---------------------------------------------------------------------
// The on/off switch. Persisted to a small JSON file on disk so it
// survives normal server restarts. Note: on Render's free tier the
// filesystem can be wiped when the service spins down after inactivity
// and spins back up later — if that happens the switch resets to "off"
// and previously issued voice-step tokens are forgotten. An always-on
// (paid) instance avoids this entirely. Worth knowing, not a bug.
// ---------------------------------------------------------------------
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { letterEnabled: false };
  }
}
function saveState(next) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(next));
  } catch (err) {
    console.error("Could not persist toggle state:", err);
  }
}
let state = loadState();

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_SECRET) {
    return res.status(500).json({ ok: false, error: "ADMIN_SECRET is not configured on the server." });
  }
  const provided = req.headers["x-admin-secret"] || req.query.secret || (req.body && req.body.secret);
  if (!safeEqual(provided, ADMIN_SECRET)) {
    return res.status(401).json({ ok: false, error: "Invalid admin secret." });
  }
  next();
}

// ---------------------------------------------------------------------
// Tokens that prove a visitor actually completed the voice step. Issued
// server-side after a successful Telegram send — never trust the client
// alone for this, since browser JS can be bypassed with dev tools.
// ---------------------------------------------------------------------
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const verifiedTokens = new Map(); // token -> expiry timestamp

function issueToken() {
  const token = crypto.randomBytes(24).toString("hex");
  verifiedTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}
function isTokenValid(token) {
  if (!token) return false;
  const expiry = verifiedTokens.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    verifiedTokens.delete(token);
    return false;
  }
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of verifiedTokens) {
    if (now > expiry) verifiedTokens.delete(token);
  }
}, 60 * 60 * 1000).unref();

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

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

    const token = issueToken();
    res.json({ ok: true, token, letterEnabled: !!state.letterEnabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error while sending the voice note." });
  }
});

// Lets the page poll (without re-recording) to see if the letter has been
// switched on yet.
app.get("/api/letter-status", (req, res) => {
  const verified = isTokenValid(req.query.token);
  res.json({ ok: true, verified, letterEnabled: verified ? !!state.letterEnabled : undefined });
});

app.get("/api/letter", (req, res) => {
  if (!isTokenValid(req.query.token)) {
    return res.status(401).json({ ok: false, reason: "unverified", error: "Complete the voice step first." });
  }
  if (!state.letterEnabled) {
    return res.status(423).json({ ok: false, reason: "locked", error: "The letter hasn't been unlocked yet." });
  }
  if (!fs.existsSync(LETTER_PATH)) {
    return res.status(404).json({ ok: false, reason: "missing", error: "Letter file not found on the server." });
  }
  res.sendFile(LETTER_PATH);
});

app.get("/api/admin/status", requireAdmin, (req, res) => {
  res.json({ ok: true, letterEnabled: !!state.letterEnabled });
});

app.post("/api/admin/letter", requireAdmin, (req, res) => {
  const enabled = !!(req.body && req.body.enabled);
  state = { ...state, letterEnabled: enabled };
  saveState(state);
  res.json({ ok: true, letterEnabled: state.letterEnabled });
});

// GET convenience versions so the switch can be flipped from a bookmarked
// link too, not just from the admin page.
app.get("/api/admin/enable", requireAdmin, (req, res) => {
  state = { ...state, letterEnabled: true };
  saveState(state);
  res.json({ ok: true, letterEnabled: true });
});
app.get("/api/admin/disable", requireAdmin, (req, res) => {
  state = { ...state, letterEnabled: false };
  saveState(state);
  res.json({ ok: true, letterEnabled: false });
});

app.get("/*splat", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(port, () => console.log(`Love-letter app running on port ${port}`));
