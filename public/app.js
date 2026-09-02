const $ = (id) => document.getElementById(id);

const question = $("question");
const voice = $("voice");
const letter = $("letter");
const yesBtn = $("yesBtn");
const noBtn = $("noBtn");
const tease = $("tease");
const recordBtn = $("recordBtn");
const sendBtn = $("sendBtn");
const transcriptEl = $("transcript");
const statusEl = $("status");
const timerEl = $("timer");
const support = $("support");

let mediaRecorder = null;
let chunks = [];
let recording = false;
let seconds = 0;
let timerInterval = null;
let transcript = "";
let recognition = null;
let phraseDetected = false;

function moveNoButton() {
  const area = $("buttons").getBoundingClientRect();
  const btn = noBtn.getBoundingClientRect();
  const maxX = Math.max(0, area.width - btn.width);
  const maxY = Math.max(0, area.height - btn.height);
  noBtn.style.left = Math.floor(Math.random() * maxX) + "px";
  noBtn.style.top = Math.floor(Math.random() * maxY) + "px";
  tease.textContent = ["Nope 😌", "Too slow!", "Try again 🙈", "That button has other plans 😂"][Math.floor(Math.random()*4)];
}
["mouseenter","pointerdown","touchstart","focus"].forEach(ev => noBtn.addEventListener(ev, moveNoButton));
noBtn.addEventListener("click", (e) => { e.preventDefault(); moveNoButton(); });

yesBtn.addEventListener("click", () => {
  question.classList.add("hidden");
  voice.classList.remove("hidden");
  setupRecognition();
});

function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    support.textContent = "Speech recognition is not supported here. The recording button can still be used, but the phrase check is unavailable.";
    return;
  }
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let text = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      text += event.results[i][0].transcript + " ";
    }
    transcript += " " + text;
    transcript = transcript.slice(-1000);
    transcriptEl.textContent = transcript.trim() || "Listening…";

    const normalized = transcript.toLowerCase()
      .replace(/[.,!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (/\bi\s+love\s+you\b/.test(normalized) || /\beye\s+love\s+you\b/.test(normalized)) {
      phraseDetected = true;
      sendBtn.disabled = false;
      transcriptEl.textContent = "Phrase detected: “I love you” ❤️";
    }
  };
  recognition.onerror = () => {};
  recognition.onend = () => {
    if (recording) {
      try { recognition.start(); } catch {}
    }
  };
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    phraseDetected = false;
    transcript = "";
    transcriptEl.textContent = "Listening…";
    sendBtn.disabled = true;

    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = () => stream.getTracks().forEach(t => t.stop());

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

    if (recognition) {
      try { recognition.start(); } catch {}
    }
  } catch (err) {
    statusEl.textContent = "Microphone permission is required to record the voice note.";
  }
}

function stopRecording() {
  if (!mediaRecorder || !recording) return;
  mediaRecorder.stop();
  recording = false;
  clearInterval(timerInterval);
  recordBtn.textContent = "● Record again";
  recordBtn.classList.remove("recording");
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
  if (!phraseDetected) {
    transcriptEl.textContent = "I didn't detect “I love you” yet. Try recording again clearly.";
    sendBtn.disabled = true;
  }
}

recordBtn.addEventListener("click", () => recording ? stopRecording() : startRecording());

sendBtn.addEventListener("click", async () => {
  if (!chunks.length || !phraseDetected) return;
  sendBtn.disabled = true;
  statusEl.textContent = "Sending your voice note… 💌";

  const blob = new Blob(chunks, { type: "audio/webm" });
  const form = new FormData();
  form.append("voice", blob, "i-love-you.webm");

  try {
    const response = await fetch("/api/send-voice", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Send failed");

    voice.classList.add("hidden");
    letter.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't send it. Please try again.";
    sendBtn.disabled = false;
  }
});
