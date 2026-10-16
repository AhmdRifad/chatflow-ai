# ChatFlow AI — Complete starter website

A responsive ChatFlow-style AI chat website with a Node.js/Express backend and Gemini API integration. The API key is read on the server, not in browser JavaScript.

## Where to enter your Gemini API key

**Local testing:**
1. Open Google AI Studio: https://aistudio.google.com/apikey
2. Create/copy a Gemini API key. Check the model's availability and your account's free-tier limits.
3. In this project folder, copy `.env.example` and name the copy `.env`.
4. Open `.env` and replace `PASTE_YOUR_GEMINI_API_KEY_HERE` with your key:

   ```env
   GEMINI_API_KEY=your_actual_key_goes_here
   PORT=3000
   ```

   This `.env` file is the exact place for local development. Do not share it or commit it to GitHub.

## Run on a computer

Install Node.js 20 or newer, then run these commands in the project folder:

```bash
npm install
npm start
```

Open http://localhost:3000. The chat UI is in `public/`; the server/API is in `server.js`.

## Deploy from a phone using GitHub + Render

1. Upload the project files to a GitHub repository. Do **not** upload `.env`; `.gitignore` excludes it.
2. Open https://render.com/ and create a **Web Service** connected to the repository.
3. Use build command `npm install` and start command `npm start`.
4. In the Render service dashboard, open **Environment** and add:
   - Key: `GEMINI_API_KEY`
   - Value: paste your Gemini API key
5. Optionally add `GEMINI_MODEL` with a model available to your Gemini API account. The default in this project is `gemini-2.5-flash`.
6. Save and deploy. Open the Render URL after deployment completes.

Render free-service availability, sleep behavior, limits, and pricing can change; check its current plan before deployment. A hosted backend is needed because GitHub Pages alone cannot securely keep a private API key.

## What's included

- Responsive dark UI with mobile sidebar and optional light theme
- New chat, prompt suggestions, enter-to-send and shift-enter newline
- Multi-turn chat context for the current conversation
- Server-side Gemini calls, bounded request size/history, useful error messages
- Health status indicator
- `.env` secret exclusion via `.gitignore`

## Notes

- The chat history is held in memory in the current browser tab; it is not a cloud account or permanent database.
- Gemini free-tier eligibility, model availability, rate limits, and data policies vary by account and can change. Review the current official documentation: https://ai.google.dev/gemini-api/docs
- Never paste your API key into `public/app.js`, `public/index.html`, or a public GitHub file. If a key leaks, revoke it and create a replacement.
