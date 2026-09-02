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
const support = $("support");

let mediaRecorder = null;
let chunks = [];
let recording = false;
let seconds = 0;
let timerInterval = null;
let transcript = "";
let recognition = null;
let phraseDetected = false;
let mediaStopped = false;
let recognitionEnded = false;
let finalizeTimeout = null;
let voiceToken = null;
let statusPollInterval = null;
let failedAttempts = 0;
const overrideBtn = $("overrideBtn");

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
    support.textContent = "Speech recognition isn't supported in this browser, so the phrase can't be auto-checked — but recording still works, and Send will unlock once you've recorded something.";
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

    if (/\b(i|eye)\b.{0,15}\blove\b.{0,15}\b(you|ya|yah|u|yew|yoo)\b/.test(normalized)) {
      phraseDetected = true;
      sendBtn.disabled = false;
      transcriptEl.textContent = "Phrase detected: “I love you” ❤️";
    }
  };
  recognition.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    support.textContent = `Voice recognition hit an error (${event.error}). Recording still works — Send will unlock once you've recorded something.`;
  };
  recognition.onend = () => {
    if (recording) {
      // Still recording (e.g. engine auto-restarts every ~60s) — keep listening.
      try { recognition.start(); } catch {}
    } else {
      // This is the real end, triggered by stopRecording(). Give it a moment
      // to finish processing before we trust phraseDetected either way.
      recognitionEnded = true;
      maybeFinalize();
    }
  };
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    phraseDetected = false;
    mediaStopped = false;
    recognitionEnded = false;
    if (finalizeTimeout) clearTimeout(finalizeTimeout);
    transcript = "";
    transcriptEl.textContent = "Listening…";
    sendBtn.disabled = true;

    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      mediaStopped = true;
      maybeFinalize();
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
  recording = false;
  clearInterval(timerInterval);
  recordBtn.textContent = "● Record again";
  recordBtn.classList.remove("recording");
  if (!phraseDetected) transcriptEl.textContent = "Checking what you said…";
  mediaRecorder.stop();
  if (recognition) {
    try { recognition.stop(); } catch {}
  } else {
    recognitionEnded = true;
  }
}

function maybeFinalize() {
  const recognitionAvailable = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // If there's no recognition engine at all, we only need the recorder to stop.
  if (!recognitionAvailable) {
    if (mediaStopped) finalizeRecording();
    return;
  }

  if (mediaStopped && recognitionEnded) {
    if (finalizeTimeout) { clearTimeout(finalizeTimeout); finalizeTimeout = null; }
    finalizeRecording();
    return;
  }

  // Recognition can take a little while to deliver its final result after
  // stop() is called. Give it up to 1.5s past mediaRecorder stopping before
  // finalizing anyway, so we never hang forever if onend doesn't fire.
  if (mediaStopped && !finalizeTimeout) {
    finalizeTimeout = setTimeout(() => {
      finalizeTimeout = null;
      finalizeRecording();
    }, 1500);
  }
}

function finalizeRecording() {
  const recognitionAvailable = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  if (recognitionAvailable && !phraseDetected) {
    transcriptEl.textContent = "I didn't detect “I love you” yet. Try recording again clearly.";
    sendBtn.disabled = true;
    failedAttempts++;
    if (failedAttempts >= 2) overrideBtn.classList.remove("hidden");
    return;
  }
  overrideBtn.classList.add("hidden");

  // No speech recognition available (e.g. Safari/iOS) or phrase confirmed:
  // unlock sending as long as we actually captured audio.
  if (chunks.length) {
    sendBtn.disabled = false;
    if (!recognitionAvailable) {
      transcriptEl.textContent = "Got your recording 🎙️ — press send when ready.";
    }
  } else {
    transcriptEl.textContent = "No audio captured. Please try recording again.";
    sendBtn.disabled = true;
  }
}

recordBtn.addEventListener("click", () => recording ? stopRecording() : startRecording());

overrideBtn.addEventListener("click", () => {
  if (!chunks.length) return;
  phraseDetected = true;
  sendBtn.disabled = false;
  overrideBtn.classList.add("hidden");
  transcriptEl.textContent = "Okay — sending your recording as-is 💌";
});

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
        // Token expired or server restarted and lost it — back to the start.
        stopPolling();
        try { localStorage.removeItem("loveLetterToken"); } catch {}
      }
    } catch {
      // Network hiccup — just try again on the next tick.
    }
  }, 8000);
}

// If we already have a token from a previous visit, skip straight past the
// question/recording steps instead of making them do it all again.
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
    // Couldn't reach the server — just fall through to the normal flow.
  }
})();

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
