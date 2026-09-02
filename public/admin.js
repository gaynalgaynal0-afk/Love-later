const $ = (id) => document.getElementById(id);
const secretForm = $("secretForm");
const switchPanel = $("switchPanel");
const secretInput = $("secretInput");
const saveSecret = $("saveSecret");
const statusLabel = $("statusLabel");
const enableBtn = $("enableBtn");
const disableBtn = $("disableBtn");
const adminStatus = $("adminStatus");
const forgetSecret = $("forgetSecret");

function getSecret() {
  try { return localStorage.getItem("loveLetterAdminSecret"); } catch { return null; }
}
function setSecret(v) {
  try { localStorage.setItem("loveLetterAdminSecret", v); } catch {}
}
function clearSecret() {
  try { localStorage.removeItem("loveLetterAdminSecret"); } catch {}
}

async function callAdmin(path, options = {}) {
  const secret = getSecret();
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), "x-admin-secret": secret || "" }
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || "Request failed");
  return data;
}

function renderEnabled(enabled) {
  statusLabel.textContent = enabled ? "ON 💌" : "OFF 🔒";
}

async function refreshStatus() {
  try {
    const data = await callAdmin("/api/admin/status");
    renderEnabled(data.letterEnabled);
    secretForm.classList.add("hidden");
    switchPanel.classList.remove("hidden");
  } catch (err) {
    clearSecret();
    secretForm.classList.remove("hidden");
    switchPanel.classList.add("hidden");
  }
}

saveSecret.addEventListener("click", () => {
  const v = secretInput.value.trim();
  if (!v) return;
  setSecret(v);
  refreshStatus();
});

enableBtn.addEventListener("click", async () => {
  adminStatus.textContent = "Updating…";
  try {
    const data = await callAdmin("/api/admin/letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true })
    });
    renderEnabled(data.letterEnabled);
    adminStatus.textContent = "The letter is now unlocked for anyone who's completed the voice step.";
  } catch (err) {
    adminStatus.textContent = "Couldn't update: " + err.message;
  }
});

disableBtn.addEventListener("click", async () => {
  adminStatus.textContent = "Updating…";
  try {
    const data = await callAdmin("/api/admin/letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false })
    });
    renderEnabled(data.letterEnabled);
    adminStatus.textContent = "The letter is locked again.";
  } catch (err) {
    adminStatus.textContent = "Couldn't update: " + err.message;
  }
});

forgetSecret.addEventListener("click", (e) => {
  e.preventDefault();
  clearSecret();
  secretForm.classList.remove("hidden");
  switchPanel.classList.add("hidden");
  secretInput.value = "";
});

refreshStatus();
