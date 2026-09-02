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
let recognitionErrored = false;

const MIN_DISTANCE_FROM_YES = 160; // px, enforced so No can never land near Yes

function moveNoButton() {
  const btn = noBtn.getBoundingClientRect();
  const yes = yesBtn.getBoundingClientRect();
  const yesCenterX = yes.left + yes.width / 2;
  const yesCenterY = yes.top + yes.height / 2;

  const pad = 12;
  const maxX = Math.max(pad, window.innerWidth - btn.width - pad);
  const maxY = Math.max(pad, window.innerHeight - btn.height - pad);

  let x, y, tries = 0;
  do {
    x = pad + Math.random() * (maxX - pad);
    y = pad + Math.random() * (maxY - pad);
    const centerX = x + btn.width / 2;
    const centerY = y + btn.height / 2;
    const dist = Math.hypot(centerX - yesCenterX, centerY - yesCenterY);
    tries++;
    if (dist >= MIN_DISTANCE_FROM_YES || tries > 30) break;
  } while (true);

  noBtn.classList.add("roaming");
  noBtn.style.left = x + "px";
  noBtn.style.top = y + "px";
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
    support.textContent = "Speech recognition isn't supported in this browser — recording still works, and Send will unlock once you've recorded something.";
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

    const normalized = transcript.toLowerCase()
      .replace(/[.,!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (/\bi\s+love\s+you\b/.test(normalized) || /\beye\s+love\s+you\b/.test(normalized)) {
      phraseDetected = true;
    }

    if (recording) {
      transcriptEl.textContent = phraseDetected
        ? "Heard it! Keep going or press stop. ❤️"
        : (transcript.trim() ? `Hearing: “${transcript.trim()}”` : "Listening…");
    }
  };
  recognition.onerror = (e) => {
    recognitionErrored = true;
  };
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
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      finalizeRecording();
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
}

function finalizeRecording() {
  if (!chunks.length) {
    transcriptEl.textContent = "No audio captured. Please try recording again.";
    sendBtn.disabled = true;
    return;
  }

  // Audio was captured successfully — that's all we require to send.
  sendBtn.disabled = false;

  if (phraseDetected) {
    transcriptEl.textContent = "Heard “I love you” ❤️ — press send when ready.";
  } else {
    transcriptEl.textContent = "Got your recording 🎙️ — press send when ready.";
  }
}

recordBtn.addEventListener("click", () => recording ? stopRecording() : startRecording());

sendBtn.addEventListener("click", async () => {
  if (!chunks.length) return;
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
