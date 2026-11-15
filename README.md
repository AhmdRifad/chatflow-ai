# ChatFlow AI v2.0 PRO — Modern AI Workspace

ChatFlow AI is an ultra-fast, responsive AI workspace featuring multi-provider support (**Google Gemini 3.8** and **Groq**), live token streaming (SSE), sandbox code execution (**Python 3.14** and **JavaScript**), a side-by-side **Model Comparison Arena**, multimodal file & image analysis, voice dictation, and built-in text-to-speech.

---

## ⚡ What Makes It 100x Better

- **Real-Time Token Streaming (SSE)**: Instant time-to-first-token with smooth cursor animation, cancellable at any moment with the Stop button.
- **Multi-Provider Engine**:
  - 🌟 **Gemini 3.8 Flash**: Lightning-fast reasoning with 1M token context.
  - 🧠 **Gemini 3 Pro**: Deep analysis for advanced coding and math.
  - ⚡ **Groq Llama 3.3 (70B)**: Blazing fast open-weights inference.
  - 🌪️ **Groq Mixtral (8x7B)**: Mixture-of-Experts architecture.
  - 💡 **Interactive Demo Assistant**: Works out-of-the-box without requiring API keys!
- **In-Browser API Key Setup**: Enter keys directly in the **Settings** panel (stored securely in browser `localStorage`), or configure them in `.env` on your server.
- **Code Studio & Live Sandbox**:
  - 🐍 **Python 3 Sandbox**: Real server-side code execution with timing and error handling.
  - 🌐 **Interactive Web Preview**: Live HTML, CSS, and JS editor with real-time sandbox preview.
  - 🤖 **AI Code Actions**: One-click "Explain with AI" and "Fix & Debug with AI".
- **Model Comparison Arena (Compare Tab)**:
  - Run prompts simultaneously through two models in parallel.
  - Real-world performance metrics: Latency (ms), Tokens generated, Tokens/sec, and Clarity scores.
  - Community winner voting with celebratory feedback.
- **Multimodal & Voice Input**:
  - 📎 Attach images (`.png`, `.jpg`, `.webp`) or text/code files via file picker, drag-and-drop, or clipboard paste (`Ctrl+V`).
  - 🎙️ Hands-free voice dictation using browser Speech-to-Text.
  - 🔊 Listen to answers with built-in Text-to-Speech synthesis.
- **Rich Markdown, Code Highlighting & Math**:
  - Beautiful syntax highlighting with line numbers, language badges, and "Copy Code" button.
  - One-click "Open in Studio" button to send code directly from chat into the live sandbox.
  - LaTeX / KaTeX math equation rendering (`$..$` and `$$..$$`).
- **Command Palette & Hotkeys**:
  - `⌘K` / `Ctrl+K`: Instant spotlight command palette.
  - `⌘N` / `Ctrl+N`: Start new conversation.
  - `Ctrl + 1-4`: Instant tab switching (Chat, Compare, Studio, Settings).
  - `Enter` to send, `Shift+Enter` for newline.
- **Dark Mode & Themes**:
  - High-contrast, modern dark theme + clean light theme with instant toggle.
  - Persona system: General, Senior Coder, Creative Writer, Academic Tutor, Concise Assistant.

---

## 🚀 Quick Start

### 1. Install & Run Locally

Requires **Node.js 20+** and **Python 3** (optional, for Python sandbox execution):

```bash
# Clone the repository and enter directory
cd chatflow-ai

# Install dependencies
npm install

# Start the server
npm start
```

Open your browser to: **http://localhost:3000**

---

## 🔑 Configuring API Keys

You have two convenient options to add your API keys:

### Option A: Directly in the Browser (Recommended)
1. Open the app at `http://localhost:3000`.
2. Click the **Settings** tab.
3. Paste your free **Gemini API Key** ([Google AI Studio](https://aistudio.google.com/apikey)) or **Groq API Key** ([Groq Console](https://console.groq.com/keys)).
4. Click **Test** to verify connectivity, then click **Save API Keys**.

### Option B: In the `.env` File
Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

---

## 🌐 Deploy to Render, Railway, or VPS

1. Push your repository to GitHub.
2. In **Render** or **Railway**, create a new Web Service pointing to your repository.
3. Set Build Command: `npm install`
4. Set Start Command: `npm start`
5. In Environment Variables, set:
   - `GEMINI_API_KEY`: *(your Gemini key)*
   - `GROQ_API_KEY`: *(your Groq key)*
6. Deploy and access your live URL!

---

## 📁 Project Architecture

```
chatflow-ai/
├── public/
│   ├── app.js          # Client logic (SSE streaming, voice, studio, compare)
│   ├── favicon.svg     # Modern gradient brand icon
│   ├── index.html      # Responsive semantic HTML5 workspace
│   └── styles.css      # Dark/light theme design system
├── server.js           # Express API server (Gemini, Groq, sandbox runners)
├── package.json        # Dependencies & start scripts
├── .env.example        # Environment variables template
└── README.md           # Documentation
```

---

## 🛡️ Security & Privacy
- API keys configured in `.env` remain server-side and are never leaked to public client bundles.
- In-browser API keys are stored only in your private browser `localStorage` and sent over HTTPS headers.
- Python and Node execution occurs within restricted sandboxes with execution timeouts and safety guardrails.
