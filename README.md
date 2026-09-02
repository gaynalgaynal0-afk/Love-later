# Love Letter Website — Render Ready

## What it does
1. Shows **"Do you love me?"** with Yes/No.
2. The No button playfully moves away.
3. Yes opens a microphone step.
4. The browser records a voice note and uses browser speech recognition to check for **"I love you"**.
5. Only after the phrase is detected can the recording be submitted.
6. The recording is sent by your Telegram bot to the configured admin chat ID, and the server issues the visitor a one-time verification token.
7. The PDF letter is revealed **only if** that token is valid *and* you've switched the letter ON (see below). If it's still OFF, the visitor sees a "hang tight" screen that unlocks itself automatically, with no refresh needed, the moment you flip the switch.

## The letter switch
The letter file lives in `private/letter.pdf` — **not** inside `public/`, so it can't be fetched directly no matter how the URL is guessed. It's only ever served through `/api/letter`, which checks both the visitor's token and your switch.

You control the switch two ways:
- **Admin page:** visit `/admin.html` on your deployed site, enter your `ADMIN_SECRET`, and tap "Turn ON" / "Turn OFF".
- **Direct links / curl**, if you prefer:
  ```bash
  curl -H "x-admin-secret: YOUR_SECRET" https://your-site.onrender.com/api/admin/enable
  curl -H "x-admin-secret: YOUR_SECRET" https://your-site.onrender.com/api/admin/disable
  ```

**Persistence caveat:** the switch state and the visitor tokens are stored in memory and in a small file on disk. On an always-on (paid) Render instance this is durable. On the **free tier**, Render can spin the service down after inactivity and wipe local disk on the next spin-up — if that happens, the switch resets to OFF and any visitor who already completed the voice step would need to redo it. If reliability matters (e.g. you plan to leave the letter available long-term), consider an always-on plan.

## Important
- Keep `TELEGRAM_BOT_TOKEN` and `ADMIN_SECRET` private. Never put them in `public/` or frontend JavaScript.
- `TELEGRAM_ADMIN_CHAT_ID` is the only destination used by the backend for voice notes.
- Browser speech recognition is a convenience check, not a cryptographic proof — but the actual letter access is now gated server-side regardless, so this only affects whether *the recorder itself* lets someone submit their recording.
- Replace `private/letter.pdf` with your own PDF (not `public/letter.pdf` — that path no longer exists).
- `/admin.html` isn't linked from anywhere on the main site, but it isn't secret either — anyone who finds the URL just hits a password prompt, which is enforced server-side.

## Render
Create a new **Web Service** from this project.
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_ADMIN_CHAT_ID`
  - `ADMIN_SECRET` — a long random passphrase you choose; this protects `/admin.html` and the `/api/admin/*` endpoints.

Then deploy. HTTPS from Render is required for microphone access.

## Finding your Telegram chat ID
Send a message to your bot from the Telegram account that should receive the voice note, then use a trusted Telegram bot/API method to determine that chat ID. Put that ID into Render's environment variables.

## Local test
```bash
npm install
npm start
```
Open the HTTPS Render URL after deployment for microphone access (or `http://localhost:PORT` locally — mic access also works over plain `http://localhost`).
