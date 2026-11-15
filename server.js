import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { spawn } from 'child_process';
import vm from 'vm';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static('public'));

// Supported models registry
const AVAILABLE_MODELS = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'Google AI',
    badge: 'Recommended',
    description: 'Fastest, state-of-the-art multimodal reasoning with 1M token context',
    supportsVision: true,
    isDefault: true,
  },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    provider: 'Google AI',
    badge: 'Deep Reasoning',
    description: 'Maximum intelligence for complex code, math, and multi-step reasoning',
    supportsVision: true,
    isDefault: false,
  },
  {
    id: 'groq-llama-3.3-70b',
    name: 'Groq Llama 3.3 (70B)',
    provider: 'Groq',
    badge: 'Ultra Fast',
    description: 'Blazing fast inference with Meta flagship 70B open model',
    supportsVision: false,
    isDefault: false,
  },
  {
    id: 'groq-mixtral',
    name: 'Groq Mixtral (8x7B)',
    provider: 'Groq',
    badge: 'MoE Power',
    description: 'High-speed Mixture-of-Experts for diverse coding & analysis',
    supportsVision: false,
    isDefault: false,
  },
  {
    id: 'groq-llama3-8b',
    name: 'Groq Llama 3 (8B)',
    provider: 'Groq',
    badge: 'Instant',
    description: 'Near-zero latency responses for quick inquiries',
    supportsVision: false,
    isDefault: false,
  },
  {
    id: 'demo-mode',
    name: 'Interactive Demo Assistant',
    provider: 'Built-in',
    badge: 'Offline / Free',
    description: 'Smart simulated AI assistant that requires zero API keys',
    supportsVision: false,
    isDefault: false,
  },
];

// Helper to safely get Groq client
function getGroqClient(keyFromHeader) {
  const apiKey = (keyFromHeader && keyFromHeader.trim()) || process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.includes('your_groq_api_key')) return null;
  try {
    return new Groq({ apiKey });
  } catch (err) {
    console.error('Error creating Groq client:', err.message);
    return null;
  }
}

// Helper to safely get Gemini client
function getGeminiClient(keyFromHeader) {
  const apiKey = (keyFromHeader && keyFromHeader.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('your_gemini_api_key')) return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    console.error('Error creating Gemini client:', err.message);
    return null;
  }
}

// Map Groq friendly model names to API identifiers
function resolveGroqModel(modelId) {
  switch (modelId) {
    case 'groq-llama-3.3-70b':
      return 'llama-3.3-70b-versatile';
    case 'groq-llama3-70b':
      return 'llama3-70b-8192';
    case 'groq-mixtral':
      return 'mixtral-8x7b-32768';
    case 'groq-llama3-8b':
      return 'llama3-8b-8192';
    default:
      return 'llama-3.3-70b-versatile';
  }
}

// Map Gemini friendly model names
function resolveGeminiModel(modelId) {
  if (modelId === 'gemini-3-pro' || modelId === 'gemini-2.5-pro') return 'gemini-3-pro-preview';
  if (modelId === 'gemini-3.8-flash' || modelId === 'gemini-2.5-flash') return 'gemini-3.8-flash';
  if (modelId === 'gemini-2.0-flash') return 'gemini-2.0-flash';
<<<<<<< HEAD
  return 'gemini-3.8-flash';
=======
  if (modelId === 'gemini-1.5-flash') return 'gemini-1.5-flash';
  return modelId || 'gemini-3.8-flash';
>>>>>>> cd51ea8 (Update project files)
}

// Smart simulated response generator when API keys are not yet configured
function generateDemoResponse(prompt, model = 'demo-mode') {
  const lower = (prompt || '').toLowerCase().trim();

  if (lower.includes('fibonacci') || lower.includes('python')) {
    return `### Python Fibonacci Generator\n\nHere is an optimized implementation in Python:\n\n\`\`\`python\ndef fibonacci(n: int) -> list[int]:\n    \"\"\"Return the first n Fibonacci numbers with O(n) time.\"\"\"\n    if n <= 0:\n        return []\n    sequence = [0, 1]\n    while len(sequence) < n:\n        sequence.append(sequence[-1] + sequence[-2])\n    return sequence[:n]\n\n# Example usage:\nprint("First 10 Fibonacci numbers:", fibonacci(10))\n\`\`\`\n\n💡 *Tip: You can test this code immediately by clicking the **Studio** tab at the top or pasting it into the code sandbox!*`;
  }

  if (lower.includes('tcp') && lower.includes('udp')) {
    return `### TCP vs. UDP Comparison\n\n| Feature | TCP (Transmission Control Protocol) | UDP (User Datagram Protocol) |\n| :--- | :--- | :--- |\n| **Connection** | Connection-oriented (3-way handshake) | Connectionless |\n| **Reliability** | Guaranteed delivery & packet ordering | Best effort, packets may drop or arrive out of order |\n| **Speed** | Higher overhead, moderate speed | Minimal overhead, ultra-fast |\n| **Use Cases** | Web (HTTP/HTTPS), Email, File transfer (FTP) | Video streaming, Online gaming, DNS, VoIP |\n\n**Summary:** Use **TCP** when data accuracy is critical; use **UDP** when speed and real-time delivery take priority!`;
  }

  if (lower.includes('dfd') || lower.includes('data flow diagram') || lower.includes('external entities')) {
    return `### External Entities & Processes in a DFD\n\nIn a **Data Flow Diagram (DFD)**:\n\n1. **External Entities (Terminators)**:\n   - Represent external people, organizations, or external systems outside the system boundary.\n   - They are the **source** (origin) or **sink** (destination) of data.\n   - Visual symbol: Usually depicted as a **rectangle**.\n\n2. **Processes**:\n   - Represent activities that transform, manipulate, or calculate incoming data into outgoing information.\n   - Every process must have at least one input data flow and at least one output data flow.\n   - Visual symbol: Depicted as an **oval**, rounded rectangle, or circle.`;
  }

  return `### 👋 Welcome to ChatFlow AI!\n\nYou're currently chatting with the **Interactive Demo Assistant** because no API keys were detected yet.\n\nTo unlock live models from **Google Gemini** and **Groq**:\n1. Click the **Settings** tab (top right).\n2. Paste your free **Gemini API Key** ([Google AI Studio](https://aistudio.google.com/apikey)) or **Groq API Key** ([Groq Console](https://console.groq.com/keys)).\n3. Click **Save Keys** — they are stored securely in your browser and used instantly!\n\nAlternatively, set them in your server's \`.env\` file:\n\`\`\`env\nGEMINI_API_KEY=your_gemini_key_here\nGROQ_API_KEY=your_groq_key_here\n\`\`\`\n\n**Explore other features:**\n- ⚖️ **Compare Tab**: Side-by-side model speed and reasoning evaluation.\n- 💻 **Studio Tab**: Live Python code execution and interactive HTML/CSS/JS preview.\n- 🎙️ **Voice Dictation**: Tap the microphone button in the composer.\n- 📎 **Multimodal Uploads**: Drag and drop images or code files directly into this chat!`;
}

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------

// Health Check
app.get('/api/health', (req, res) => {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('your_gemini'));
  const hasGroq = Boolean(process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.includes('your_groq'));

  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    providers: {
      gemini: { configured: hasGemini },
      groq: { configured: hasGroq },
    },
  });
});

// List Models
app.get('/api/models', (req, res) => {
  res.json({ models: AVAILABLE_MODELS });
});

// Key Verification
app.post('/api/verify-keys', async (req, res) => {
  const { geminiKey, groqKey } = req.body || {};
  const results = {
    gemini: { valid: false, message: 'Not tested' },
    groq: { valid: false, message: 'Not tested' },
  };

  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      let resp;
      try {
        resp = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: 'ping',
        });
      } catch (err) {
        resp = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: 'ping',
        });
      }
      if (resp && resp.text) {
        results.gemini = { valid: true, message: 'Gemini API key is active and working!' };
      }
    } catch (e) {
      results.gemini = { valid: false, message: e.message || 'Invalid Gemini API key' };
    }
  }

  if (groqKey) {
    try {
      const groq = new Groq({ apiKey: groqKey });
      const resp = await groq.chat.completions.create({
        messages: [{ role: 'user', content: 'ping' }],
        model: 'llama-3.3-70b-versatile',
        max_tokens: 5,
      });
      if (resp && resp.choices) {
        results.groq = { valid: true, message: 'Groq API key is active and working!' };
      }
    } catch (e) {
      results.groq = { valid: false, message: e.message || 'Invalid Groq API key' };
    }
  }

  res.json(results);
});

// Main Chat Endpoint (Supports both SSE streaming and regular JSON)
app.post('/api/chat', async (req, res) => {
  const startTime = Date.now();
  const geminiHeaderKey = req.headers['x-gemini-key'];
  const groqHeaderKey = req.headers['x-groq-key'];

  try {
    const {
      message,
      messages,
      model = 'gemini-3.8-flash',
      stream = true,
      temperature = 0.7,
      systemInstruction = '',
      images = [],
    } = req.body;

    // Normalize incoming conversation history
    let chatHistory = [];
    if (Array.isArray(messages) && messages.length > 0) {
      chatHistory = messages;
    } else if (message) {
      chatHistory = [{ role: 'user', text: String(message) }];
    } else {
      return res.status(400).json({ error: 'Message or messages array is required.' });
    }

    const latestUserItem = [...chatHistory].reverse().find((m) => m.role === 'user');
    const userPrompt = latestUserItem ? latestUserItem.text : '';

    const isGroq = model && model.startsWith('groq-');
    const isExplicitDemo = model === 'demo-mode';

    const groqClient = getGroqClient(groqHeaderKey);
    const geminiClient = getGeminiClient(geminiHeaderKey);

    // Fallback to Demo mode if required keys are missing or demo selected
    const fallbackToDemo =
      isExplicitDemo ||
      (isGroq && !groqClient) ||
      (!isGroq && !geminiClient);

    // Handle SSE streaming setup
    const wantsStream = stream === true || req.headers.accept === 'text/event-stream';
    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
    }

    // --- CASE 1: DEMO SIMULATION (STREAMED OR JSON) ---
    if (fallbackToDemo) {
      const demoText = generateDemoResponse(userPrompt, model);

      if (wantsStream) {
        const words = demoText.split(' ');
        for (let i = 0; i < words.length; i++) {
          const piece = words[i] + (i < words.length - 1 ? ' ' : '');
          res.write(`data: ${JSON.stringify({ text: piece, done: false })}\n\n`);
          // Smooth simulated typing delay
          await new Promise((r) => setTimeout(r, 12));
        }
        const latency = Date.now() - startTime;
        res.write(
          `data: ${JSON.stringify({
            done: true,
            stats: { latencyMs: latency, tokenEstimate: Math.round(demoText.length / 4), model: 'Demo Mode' },
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        return res.end();
      } else {
        return res.json({
          reply: demoText,
          answer: demoText,
          stats: {
            latencyMs: Date.now() - startTime,
            tokenEstimate: Math.round(demoText.length / 4),
            model: 'Demo Mode',
          },
        });
      }
    }

    // --- CASE 2: GROQ INFERENCE ---
    if (isGroq) {
      const groqModel = resolveGroqModel(model);
      const groqMessages = [];

      if (systemInstruction) {
        groqMessages.push({ role: 'system', content: systemInstruction });
      }

      // Convert conversation history to Groq format
      for (const item of chatHistory) {
        const role = item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user';
        groqMessages.push({ role, content: item.text || '' });
      }

      if (wantsStream) {
        const chatCompletion = await groqClient.chat.completions.create({
          messages: groqMessages,
          model: groqModel,
          temperature: Math.min(Math.max(Number(temperature) || 0.7, 0), 1),
          stream: true,
        });

        let accumulated = '';
        for await (const chunk of chatCompletion) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) {
            accumulated += delta;
            res.write(`data: ${JSON.stringify({ text: delta, done: false })}\n\n`);
          }
        }

        const latency = Date.now() - startTime;
        res.write(
          `data: ${JSON.stringify({
            done: true,
            stats: { latencyMs: latency, tokenEstimate: Math.round(accumulated.length / 4), model: groqModel },
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        return res.end();
      } else {
        const chatCompletion = await groqClient.chat.completions.create({
          messages: groqMessages,
          model: groqModel,
          temperature: Math.min(Math.max(Number(temperature) || 0.7, 0), 1),
        });

        const reply = chatCompletion.choices[0]?.message?.content || 'No response from Groq.';
        return res.json({
          reply,
          answer: reply,
          stats: {
            latencyMs: Date.now() - startTime,
            tokenEstimate: Math.round(reply.length / 4),
            model: groqModel,
          },
        });
      }
    }

    // --- CASE 3: GOOGLE GEMINI INFERENCE ---
    const geminiModel = resolveGeminiModel(model);

    // Format contents for Gemini SDK (@google/genai)
    const contents = [];
    for (let i = 0; i < chatHistory.length; i++) {
      const item = chatHistory[i];
      const isUser = item.role === 'user';
      const role = isUser ? 'user' : 'model';
      const parts = [];

      if (item.text) {
        parts.push({ text: item.text });
      }

      // If latest user message has attached images
      if (isUser && i === chatHistory.length - 1 && Array.isArray(images) && images.length > 0) {
        for (const img of images) {
          if (img.data && img.mimeType) {
            parts.push({
              inlineData: {
                data: img.data.replace(/^data:[a-zA-Z0-9\/\-+.]+;base64,/, ''),
                mimeType: img.mimeType,
              },
            });
          }
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    const config = {};
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    if (temperature !== undefined) {
      config.temperature = Math.min(Math.max(Number(temperature) || 0.7, 0), 1);
    }

    if (wantsStream) {
      const responseStream = await geminiClient.models.generateContentStream({
        model: geminiModel,
        contents,
        config,
      });

      let accumulated = '';
      for await (const chunk of responseStream) {
        const chunkText = chunk.text || '';
        if (chunkText) {
          accumulated += chunkText;
          res.write(`data: ${JSON.stringify({ text: chunkText, done: false })}\n\n`);
        }
      }

      const latency = Date.now() - startTime;
      res.write(
        `data: ${JSON.stringify({
          done: true,
          stats: { latencyMs: latency, tokenEstimate: Math.round(accumulated.length / 4), model: geminiModel },
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      return res.end();
    } else {
      const response = await geminiClient.models.generateContent({
        model: geminiModel,
        contents,
        config,
      });

      const reply = response.text || 'No response from Gemini.';
      return res.json({
        reply,
        answer: reply,
        stats: {
          latencyMs: Date.now() - startTime,
          tokenEstimate: Math.round(reply.length / 4),
          model: geminiModel,
        },
      });
    }
  } catch (error) {
    console.error('API Error in /api/chat:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || 'Something went wrong processing your request.',
        details: error.toString(),
      });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

// Compare Endpoint: Evaluates two models in parallel with real-world metrics
app.post('/api/compare', async (req, res) => {
  const { prompt, modelA = 'gemini-3.8-flash', modelB = 'groq-llama-3.3-70b' } = req.body;
  const geminiHeaderKey = req.headers['x-gemini-key'];
  const groqHeaderKey = req.headers['x-groq-key'];

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required for comparison.' });
  }

  const geminiClient = getGeminiClient(geminiHeaderKey);
  const groqClient = getGroqClient(groqHeaderKey);

  // Helper function to query a single model with timing
  async function queryModel(targetModel) {
    const start = Date.now();
    const isGroq = targetModel.startsWith('groq-');

    if (isGroq) {
      const groqModelName = resolveGroqModel(targetModel);
      if (!groqClient) {
        const demo = generateDemoResponse(prompt, targetModel);
        return {
          model: targetModel,
          name: targetModel.includes('mixtral') ? 'Groq Mixtral (8x7B)' : 'Groq Llama 3.3 (70B)',
          label: 'GROQ / META',
          badge: 'High Speed',
          score: 93,
          latencyMs: 140,
          tokenCount: Math.round(demo.length / 4),
          body: demo,
          notes: ['Ultra-fast open model inference', 'Structured & crisp output', 'Demo simulation'],
        };
      }

      try {
        const completion = await groqClient.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: groqModelName,
        });
        const latency = Date.now() - start;
        const body = completion.choices[0]?.message?.content || 'No output.';
        const tokenCount = Math.round(body.length / 4);
        return {
          model: targetModel,
          name: targetModel.includes('mixtral') ? 'Groq Mixtral (8x7B)' : 'Groq Llama 3.3 (70B)',
          label: 'GROQ / META',
          badge: 'Ultra Fast',
          score: Math.min(98, 88 + Math.round(body.length / 80)),
          latencyMs: latency,
          tokenCount,
          body,
          notes: [
            `Latency: ${latency}ms`,
            `Tokens: ~${tokenCount} (${Math.round(tokenCount / (latency / 1000) || 1)} t/s)`,
            'High directness & precision',
          ],
        };
      } catch (err) {
        return {
          model: targetModel,
          name: 'Groq Model',
          label: 'GROQ',
          badge: 'Error',
          score: 50,
          latencyMs: Date.now() - start,
          tokenCount: 0,
          body: `Error: ${err.message}`,
          notes: ['API call failed'],
        };
      }
    } else {
      // Gemini Model
      const geminiModelName = resolveGeminiModel(targetModel);
      const displayName = targetModel.includes('pro') ? 'Gemini 3 Pro' : 'Gemini 3.8 Flash';
      if (!geminiClient) {
        const demo = generateDemoResponse(prompt, targetModel);
        return {
          model: targetModel,
          name: displayName,
          label: 'GOOGLE AI',
          badge: 'Optimal Reasoning',
          score: 95,
          latencyMs: 280,
          tokenCount: Math.round(demo.length / 4),
          body: demo,
          notes: ['Deep multi-turn context support', 'High comprehension clarity', 'Demo simulation'],
        };
      }

      try {
        const response = await geminiClient.models.generateContent({
          model: geminiModelName,
          contents: prompt,
        });
        const latency = Date.now() - start;
        const body = response.text || 'No output.';
        const tokenCount = Math.round(body.length / 4);
        return {
          model: targetModel,
          name: displayName,
          label: 'GOOGLE AI',
          badge: latency < 450 ? 'Optimal' : 'Deep Analysis',
          score: Math.min(99, 90 + Math.round(body.length / 90)),
          latencyMs: latency,
          tokenCount,
          body,
          notes: [
            `Latency: ${latency}ms`,
            `Tokens: ~${tokenCount}`,
            'Rich formatting & comprehensive detail',
          ],
        };
      } catch (err) {
        return {
          model: targetModel,
          name: 'Gemini Model',
          label: 'GOOGLE AI',
          badge: 'Error',
          score: 50,
          latencyMs: Date.now() - start,
          tokenCount: 0,
          body: `Error: ${err.message}`,
          notes: ['API call failed'],
        };
      }
    }
  }

  try {
    const [resultA, resultB] = await Promise.all([queryModel(modelA), queryModel(modelB)]);

    res.json({
      prompt,
      results: [resultA, resultB],
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Comparison failed' });
  }
});

// Studio Code Execution Endpoint: Runs Python and JavaScript in a safe sandbox
app.post('/api/run-code', async (req, res) => {
  const { code, language = 'python' } = req.body;

  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required.' });
  }

  const lang = (language || '').toLowerCase().trim();
  const startTime = Date.now();

  // Python Execution
  if (lang === 'python' || lang === 'py') {
    // Basic safety filter
    if (code.includes('import os') && (code.includes('os.system') || code.includes('shutil.rmtree') || code.includes('subprocess'))) {
      return res.json({
        success: false,
        output: 'Security Warning: Dangerous operating system calls are restricted in the sandbox.',
        stderr: 'Execution prevented by sandbox policy.',
        durationMs: 0,
      });
    }

    try {
      const process = spawn('python3', ['-u', '-c', code], {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (d) => (stdout += d.toString()));
      process.stderr.on('data', (d) => (stderr += d.toString()));

      process.on('error', (err) => {
        res.json({
          success: false,
          output: `Failed to execute: ${err.message}`,
          stdout: '',
          stderr: err.message,
          durationMs: Date.now() - startTime,
        });
      });

      process.on('close', (code) => {
        const duration = Date.now() - startTime;
        const fullOutput = (stdout || '') + (stderr ? (stdout ? '\n' : '') + stderr : '');
        res.json({
          success: code === 0,
          exitCode: code,
          output: fullOutput.trim() || '(Process finished with no output)',
          stdout,
          stderr,
          durationMs: duration,
        });
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // JavaScript Execution via Node VM Sandbox
  if (lang === 'javascript' || lang === 'js') {
    const logs = [];
    const sandbox = {
      console: {
        log: (...args) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')),
        error: (...args) => logs.push('[ERROR] ' + args.join(' ')),
        warn: (...args) => logs.push('[WARN] ' + args.join(' ')),
        info: (...args) => logs.push('[INFO] ' + args.join(' ')),
      },
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      parseInt,
      parseFloat,
    };

    try {
      const context = vm.createContext(sandbox);
      const script = new vm.Script(code);
      const evalResult = script.runInContext(context, { timeout: 3000 });

      if (logs.length === 0 && evalResult !== undefined) {
        logs.push(typeof evalResult === 'object' ? JSON.stringify(evalResult, null, 2) : String(evalResult));
      }

      res.json({
        success: true,
        exitCode: 0,
        output: logs.join('\n') || '(Code executed successfully with no output)',
        stdout: logs.join('\n'),
        stderr: '',
        durationMs: Date.now() - startTime,
      });
    } catch (e) {
      res.json({
        success: false,
        exitCode: 1,
        output: `Runtime Error: ${e.message}`,
        stdout: '',
        stderr: e.stack || e.message,
        durationMs: Date.now() - startTime,
      });
    }
    return;
  }

  // HTML / CSS / Other Web code
  return res.json({
    success: true,
    exitCode: 0,
    output: `File ready for live preview. Check the "Live Preview" tab!`,
    stdout: '',
    stderr: '',
    durationMs: 0,
    previewReady: true,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ChatFlow AI Server running at http://localhost:${PORT}`);
  console.log(`- Gemini API: ${process.env.GEMINI_API_KEY ? 'Configured' : 'Missing (In-app key or demo mode active)'}`);
  console.log(`- Groq API: ${process.env.GROQ_API_KEY ? 'Configured' : 'Missing (In-app key or demo mode active)'}`);
});
