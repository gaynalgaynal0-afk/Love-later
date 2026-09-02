const $ = (id) => document.getElementById(id);

const question = $("question");
const voice = $("voice");
const letter = $("letter");
const letterWaiting = $("letterWaiting");
const letterReady = $("letterReady");
const letterLink = $("letterLink");
const yesBtn = $("yesBtn");
const noBtn = $("noBtn");
const tease = $("tease");
const recordBtn = $("recordBtn");
const sendBtn = $("sendBtn");
const transcriptEl = $("transcript");
const statusEl = $("status");
const timerEl = $("timer");

let mediaRecorder = null;
let chunks = [];
let recording = false;
let seconds = 0;
let timerInterval = null;
let voiceToken = null;
let statusPollInterval = null;

function moveNoButton() {
  const area = $("buttons").getBoundingClientRect();
  const btn = noBtn.getBoundingClientRect();
  const maxX = Math.max(0, area.width - btn.width);
  const maxY = Math.max(0, area.height - btn.height);
  noBtn.style.left = Math.floor(Math.random() * maxX) + "px";
  noBtn.style.top = Math.floor(Math.random() * maxY) + "px";
  tease.textContent = ["Nope 😌", "Too slow!", "Try again 🙈", "That button has other plans 😂"][Math.floor(Math.random()*4)];
}

["mouseenter", "pointerdown", "touchstart", "focus"].forEach(ev => noBtn.addEventListener(ev, moveNoButton));
noBtn.addEventListener("click", (e) => { e.preventDefault(); moveNoButton(); });

yesBtn.addEventListener("click", () => {
  question.classList.add("hidden");
  voice.classList.remove("hidden");
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    transcriptEl.textContent = "Recording…";
    sendBtn.disabled = true;

    // Cross-browser MIME type check (iOS Safari compatibility fix)
    let options = {};
    if (MediaRecorder.isTypeSupported("audio/webm")) {
      options = { mimeType: "audio/webm" };
    } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
      options = { mimeType: "audio/mp4" };
    }

    mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (chunks.length) {
        sendBtn.disabled = false;
        transcriptEl.textContent = "Got your recording 🎙 — press send when ready.";
      } else {
        sendBtn.disabled = true;
        transcriptEl.textContent = "No audio captured. Please try recording again.";
      }
    };

    mediaRecorder.start();
    recording = true;
    seconds = 0;
    timerEl.textContent = "00:00";
    recordBtn.textContent = "■ Stop recording";
    recordBtn.classList.add("recording");
    timerInterval = setInterval(() => {
      seconds++;
      timerEl.textContent = `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
      if (seconds >= 30) stopRecording();
    }, 1000);
  } catch (err) {
    statusEl.textContent = "Microphone permission is required to record the voice note.";
  }
}

function stopRecording() {
  if (!mediaRecorder || !recording) return;
  recording = false;
  clearInterval(timerInterval);
  recordBtn.textContent = "● Record again";
  recordBtn.classList.remove("recording");
  mediaRecorder.stop();
}

recordBtn.addEventListener("click", () => recording ? stopRecording() : startRecording());

function showSection(el) {
  [question, voice, letter].forEach(s => s.classList.add("hidden"));
  el.classList.remove("hidden");
}

function stopPolling() {
  if (statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
  }
}

function showUnlocked(token) {
  stopPolling();
  letterLink.href = `/api/letter?token=${encodeURIComponent(token)}`;
  letterWaiting.classList.add("hidden");
  letterReady.classList.remove("hidden");
  showSection(letter);
}

function showWaiting(token) {
  letterReady.classList.add("hidden");
  letterWaiting.classList.remove("hidden");
  showSection(letter);
  stopPolling();
  statusPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/letter-status?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.verified && data.letterEnabled) {
        showUnlocked(token);
      } else if (!data.verified) {
        stopPolling();
        try { localStorage.removeItem("loveLetterToken"); } catch {}
      }
    } catch {
      // Network hiccup — try again on next tick.
    }
  }, 8000);
}

(async function resumeIfVerified() {
  let saved = null;
  try { saved = localStorage.getItem("loveLetterToken"); } catch {}
  if (!saved) return;
  try {
    const res = await fetch(`/api/letter-status?token=${encodeURIComponent(saved)}`);
    const data = await res.json();
    if (data.verified) {
      voiceToken = saved;
      if (data.letterEnabled) showUnlocked(saved);
      else showWaiting(saved);
    } else {
      localStorage.removeItem("loveLetterToken");
    }
  } catch {
    // Couldn't reach server.
  }
})();

sendBtn.addEventListener("click", async () => {
  if (!chunks.length) return;
  sendBtn.disabled = true;
  statusEl.textContent = "Sending your voice note… 💌";

  const mimeType = mediaRecorder.mimeType || "audio/webm";
  const blob = new Blob(chunks, { type: mimeType });
  const form = new FormData();
  form.append("voice", blob, "i-love-you.webm");

  try {
    const response = await fetch("/api/send-voice", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Send failed");

    voiceToken = data.token;
    try { localStorage.setItem("loveLetterToken", data.token); } catch {}

    if (data.letterEnabled) {
      showUnlocked(data.token);
    } else {
      showWaiting(data.token);
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't send it. Please try again.";
    sendBtn.disabled = false;
  }
});
