# Love Letter Website — Render Ready

## What it does
1. Shows **"Do you love me?"** with Yes/No.
2. The No button playfully moves away.
3. Yes opens a microphone step.
4. The browser records a voice note and uses browser speech recognition to check for **"I love you"**.
5. Only after the phrase is detected can the recording be submitted.
6. The recording is sent by your Telegram bot to the configured admin chat ID.
7. The PDF letter is then revealed.

## Important
- Keep `TELEGRAM_BOT_TOKEN` private. Never put it in `public/` or frontend JavaScript.
- `TELEGRAM_ADMIN_CHAT_ID` is the only destination used by the backend.
- Browser speech recognition is a convenience check, not a cryptographic proof. Some browsers may not support it.
- Replace `public/letter.pdf` with your own PDF.

## Render
Create a new **Web Service** from this project.
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_ADMIN_CHAT_ID`

Then deploy. HTTPS from Render is required for microphone access.

## Finding your Telegram chat ID
Send a message to your bot from the Telegram account that should receive the voice note, then use a trusted Telegram bot/API method to determine that chat ID. Put that ID into Render's environment variables.

## Local test
```bash
npm install
npm start
```
Open the HTTPS Render URL after deployment for microphone access.
