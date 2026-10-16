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
  res.json({ ok: true, configured: Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('PASTE_YOUR')) });
});

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('PASTE_YOUR')) {
    return res.status(503).json({ error: 'Gemini is not configured yet. Add your API key to the server .env file, then restart the server.' });
  }

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Please send a message.' });
  }

  // Only accept a small, recent slice of plain-text conversation history.
  const safeMessages = messages.slice(-16).map((item) => ({
    role: item?.role === 'model' ? 'model' : 'user',
    text: String(item?.text ?? '').slice(0, 6000)
  })).filter((item) => item.text.trim());

  if (!safeMessages.length || safeMessages[safeMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Your latest message must be from the user.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const contents = safeMessages.map((item) => ({
      role: item.role,
      parts: [{ text: item.text }]
    }));
    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction: 'You are ChatFlow, a helpful, clear, friendly AI assistant. Give accurate answers, explain difficult ideas simply, and admit uncertainty when needed.',
        maxOutputTokens: 2048
      }
    });
    const answer = result.text?.trim();
    if (!answer) return res.status(502).json({ error: 'The AI returned an empty answer. Please try again.' });
    res.json({ answer });
  } catch (error) {
    console.error('Gemini request failed:', error?.message || error);
    const message = String(error?.message || 'Unknown error');
    if (/429|quota|rate limit/i.test(message)) {
      return res.status(429).json({ error: 'The Gemini request limit may have been reached. Wait a little and try again, or check your AI Studio usage limits.' });
    }
    if (/api key|unauthorized|permission|403|401/i.test(message)) {
      return res.status(502).json({ error: 'Gemini rejected the API key. Check that it is correct and enabled for the Gemini API.' });
    }
    res.status(502).json({ error: 'Could not get a reply from Gemini. Check your internet connection, model availability, and server logs, then try again.' });
  }
});


app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: 'Invalid request.' });
});

app.listen(PORT, () => console.log(`ChatFlow is running on http://localhost:${PORT}`));
