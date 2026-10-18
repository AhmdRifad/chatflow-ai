import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize API Clients
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'missing' });
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || 'missing',
});

// Helper for Gemini formatting
const formatGeminiHistory = (messages) => {
  return messages.map((item) => ({
    role: item.role === 'model' ? 'model' : 'user',
    parts: [{ text: item.text }]
  }));
};

// --- CHAT ENDPOINT ---
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body;
  
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Please send a message.' });
  }

  const safeMessages = messages.slice(-16).map((item) => ({
    role: item?.role === 'model' ? 'model' : 'user',
    text: String(item?.text ?? '').slice(0, 6000)
  })).filter((item) => item.text.trim());

  if (!safeMessages.length || safeMessages[safeMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Your latest message must be from the user.' });
  }

  try {
    let answer = '';

    // ROUTE TO DEEPSEEK
    if (model === 'deepseek' || model === 'Flow Fast') {
      if (!process.env.DEEPSEEK_API_KEY) throw new Error('DeepSeek API key is missing in Render settings.');
      
      const response = await deepseek.chat.completions.create({
        model: 'deepseek-v4-flash',
        messages: safeMessages.map(m => ({ 
          role: m.role === 'model' ? 'assistant' : 'user', 
          content: m.text 
        })),
        max_tokens: 2048
      });
      answer = response.choices[0].message.content.trim();
    } 
    // ROUTE TO GEMINI
    else {
      if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API key is missing in Render settings.');
      
      const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
      const result = await genAI.models.generateContent({
        model: MODEL,
        contents: formatGeminiHistory(safeMessages),
        config: {
          systemInstruction: 'You are ChatFlow, a helpful, clear, friendly AI assistant. Give accurate answers, explain difficult ideas simply, and admit uncertainty when needed.',
          maxOutputTokens: 2048
        }
      });
      answer = result.text?.trim();
    }

    if (!answer) return res.status(502).json({ error: 'The AI returned an empty answer.' });
    return res.json({ answer });

  } catch (error) {
    console.error('Chat Error:', error.message);
    return res.status(502).json({ error: error.message || 'Failed to get a response.' });
  }
});

// --- COMPARE ENDPOINT ---
app.post('/api/compare', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });

  const results = [];
  
  // Run both in parallel
  const [dsResult, gemResult] = await Promise.allSettled([
    deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }]
    }),
    genAI.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    })
  ]);

  if (dsResult.status === 'fulfilled') {
    results.push({
      label: 'DEEPSEEK',
      name: 'DeepSeek V3',
      badge: 'Fast',
      score: 92,
      body: dsResult.value.choices[0].message.content,
      notes: ['Live API response', 'OpenAI-compatible']
    });
  } else {
    results.push({ label: 'DEEPSEEK', name: 'Error', badge: 'Error', score: 0, body: 'Failed to connect to DeepSeek. Check API key.', notes: [] });
  }

  if (gemResult.status === 'fulfilled') {
    results.push({
      label: 'GEMINI',
      name: 'Gemini Flash',
      badge: 'Optimal',
      score: 96,
      body: gemResult.value.text,
      notes: ['Live API response', 'Google SDK']
    });
  } else {
    results.push({ label: 'GEMINI', name: 'Error', badge: 'Error', score: 0, body: 'Failed to connect to Gemini. Check API key.', notes: [] });
  }

  res.json({ results });
});

// --- STUDIO SANDBOX ---
app.post('/api/run-code', (req, res) => {
  let output = '';
  
  try {
    // Sandbox to simulate the Python demo execution
    const sandbox = {
      print: (val) => { output += String(val) + '\n'; },
      fibonacci: (n) => {
        let a = 0, b = 1, result = [];
        for (let i = 0; i < n; i++) { result.push(a); [a, b] = [b, a + b]; }
        return result;
      }
    };
    
    vm.createContext(sandbox);
    vm.runInContext(`print(fibonacci(10))`, sandbox);
    
    res.json({ output: output.trim() });
  } catch (error) {
    res.json({ output: `Error: ${error.message}` });
  }
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
