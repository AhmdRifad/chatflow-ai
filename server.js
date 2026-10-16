import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(
      process.env.GEMINI_API_KEY &&
      !process.env.GEMINI_API_KEY.includes('PASTE_YOUR')
    )
  });
});

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('PASTE_YOUR')) {
    return res.status(503).json({
      error: 'Gemini is not configured yet. Add your API key to the server environment, then restart.'
    });
  }

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Please send a message.' });
  }

  // Only accept a small, recent slice of plain-text conversation history.
  const safeMessages = messages
    .slice(-16)
    .map((item) => ({
      role: item?.role === 'model' ? 'model' : 'user',
      text: String(item?.text ?? '').slice(0, 6000)
    }))
    .filter((item) => item.text.trim());

  if (!safeMessages.length || safeMessages[safeMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Your latest message must be from the user.' });
  }

  const ai = new GoogleGenAI({ apiKey });
  const contents = safeMessages.map((item) => ({
    role: item.role,
    parts: [{ text: item.text }]
  }));

  const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const MAX_ATTEMPTS = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction:
            'You are ChatFlow, a helpful, clear, friendly AI assistant. Give accurate answers, explain difficult ideas simply, and admit uncertainty when needed.',
          maxOutputTokens: 2048
        }
      });

      const answer = result.text?.trim();
      if (!answer) {
        return res.status(502).json({
          error: 'The AI returned an empty answer. Please try again.'
        });
      }

      return res.json({ answer });
    } catch (error) {
      lastError = error;
      const message = String(error?.message || 'Unknown error');
      const isRetryable = /503|UNAVAILABLE|high demand|overloaded|429|quota|rate limit/i.test(message);

      if (!isRetryable || attempt === MAX_ATTEMPTS) break;

      const delay = attempt === 1 ? 1200 : 2500;
      console.warn(`Gemini attempt ${attempt} failed (retryable): ${message}. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.error('Gemini request failed after retries:', lastError?.message || lastError);
  const message = String(lastError?.message || 'Unknown error');

  if (/429|quota|rate limit/i.test(message)) {
    return res.status(429).json({
      error: 'The Gemini request limit may have been reached. Wait a little and try again, or check your AI Studio usage limits.'
    });
  }
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(message)) {
    return res.status(503).json({
      error: 'Gemini is busy right now. Please try again in a few seconds.'
    });
  }
  if (/api key|unauthorized|permission|403|401/i.test(message)) {
    return res.status(502).json({
      error: 'Gemini rejected the API key. Check that it is correct and enabled for the Gemini API.'
    });
  }
  return res.status(502).json({
    error: 'Could not get a reply from Gemini. Please try again shortly.'
  });
});

// Catch-all: serve index.html for any non-API GET request.
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: 'Invalid request.' });
});

app.listen(PORT, () => console.log(`ChatFlow is running on http://localhost:${PORT}`));
