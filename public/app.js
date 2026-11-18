/**
 * ChatFlow AI v2.0 - Core Frontend Application
 * Real-time SSE streaming, multimodal attachments, sandbox code playground,
 * model comparison arena, voice dictation, and speech synthesis.
 */

// DOM Helper shortcuts
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// -----------------------------------------------------------------------------
// STATE MANAGEMENT
// -----------------------------------------------------------------------------
let history = [];
let conversations = [];
let activeConversationId = null;
let busy = false;
let abortController = null;
let toastTimer = null;
let speechUtterance = null;
let recognition = null;
let isRecording = false;

// Attachment State
let attachedImages = [];

// Personas dictionary
const PERSONAS = {
  general: 'You are ChatFlow AI, a helpful, intelligent, and highly knowledgeable AI assistant.',
  coder: 'You are an elite principal software engineer and tech lead. You write clean, modular, production-ready code with clear architectural explanations and best practices.',
  writer: 'You are an award-winning creative author and copywriter. You write engaging, nuanced, and captivating prose.',
  tutor: 'You are a warm, supportive academic tutor. You explain complex STEM and humanities concepts using first principles, intuitive analogies, and step-by-step guidance.',
  concise: 'You are an ultra-concise executive assistant. You answer with minimal words, bullet points, and zero fluff.'
};
let activePersona = 'general';

// Storage Keys
const CONVERSATIONS_KEY = 'chatflow-conversations-v2';
const ACTIVE_CONV_KEY = 'chatflow-active-conv-v2';
const PREFS_KEY = 'chatflow-preferences-v2';
const API_KEYS_KEY = 'chatflow-api-keys-v2';

// -----------------------------------------------------------------------------
// AUDIO SYNTHESIS (WEB AUDIO API CHIMES)
// -----------------------------------------------------------------------------
let audioCtx = null;
function playChime(type = 'success') {
  const prefs = getPrefs();
  if (!prefs.soundEffects) return;

  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'success') {
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.16); // G5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch {
    // Audio context may be restricted before user gesture
  }
}

// -----------------------------------------------------------------------------
// TOAST NOTIFICATIONS
// -----------------------------------------------------------------------------
const toastEl = document.createElement('div');
toastEl.className = 'toast';
document.body.appendChild(toastEl);

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// -----------------------------------------------------------------------------
// PREFERENCES & API KEYS HELPERS
// -----------------------------------------------------------------------------
function getPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePrefs(newPrefs) {
  const current = getPrefs();
  const merged = { ...current, ...newPrefs };
  localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  return merged;
}

function getStoredApiKeys() {
  try {
    return JSON.parse(localStorage.getItem(API_KEYS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStoredApiKeys(keys) {
  localStorage.setItem(API_KEYS_KEY, JSON.stringify(keys));
}

// -----------------------------------------------------------------------------
// THEME & APPEARANCE
// -----------------------------------------------------------------------------
function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme || 'dark');
  }
}

$('#themeToggleBtn').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  savePrefs({ theme: next });
  $('#themeSelect').value = next;
  showToast(`Switched to ${next} theme.`);
});

// -----------------------------------------------------------------------------
// BACKEND STATUS HEALTH CHECK
// -----------------------------------------------------------------------------
async function checkBackendHealth() {
  const badge = $('#backendStatusBadge');
  const text = $('#backendStatusText');

  try {
    const res = await fetch('/api/health');
    const data = await res.json();

    const storedKeys = getStoredApiKeys();
    const hasKeys =
      data.providers.gemini.configured ||
      data.providers.groq.configured ||
      Boolean(storedKeys.geminiKey || storedKeys.groqKey);

    if (hasKeys) {
      badge.classList.remove('warning');
      text.textContent = 'AI Online';
      badge.title = 'Gemini & Groq API engines connected.';
    } else {
      badge.classList.add('warning');
      text.textContent = 'Demo Mode';
      badge.title = 'Using Interactive Demo Mode. Add API keys in Settings to connect live models.';
    }
  } catch {
    badge.classList.add('warning');
    text.textContent = 'Offline';
    badge.title = 'Backend server unreachable.';
  }
}

// -----------------------------------------------------------------------------
// TABS NAVIGATION
// -----------------------------------------------------------------------------
function switchTab(tabId) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tabId));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tabId));
  document.body.classList.remove('sidebar-open');

  if (tabId === 'chat') {
    $('#promptInput')?.focus();
  }
}

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// -----------------------------------------------------------------------------
// MOBILE SIDEBAR TOGGLE
// -----------------------------------------------------------------------------
const mobileMenuBtn = $('#mobileMenuBtn');
const sidebarOverlay = document.createElement('div');
sidebarOverlay.className = 'sidebar-overlay';
document.body.appendChild(sidebarOverlay);

mobileMenuBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
sidebarOverlay.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

// -----------------------------------------------------------------------------
// PERSONA SELECTORS
// -----------------------------------------------------------------------------
$$('.persona-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $$('.persona-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    activePersona = chip.dataset.persona || 'general';
    showToast(`Persona switched to: ${chip.textContent.trim()}`);
  });
});

// -----------------------------------------------------------------------------
// CONVERSATIONS MANAGEMENT & PERSISTENCE
// -----------------------------------------------------------------------------
function loadConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveConversations() {
  const active = conversations.find((c) => c.id === activeConversationId);
  if (active) {
    active.messages = history.slice();
    active.updatedAt = Date.now();
    if (!active.title || active.title === 'New conversation') {
      const firstUser = history.find((m) => m.role === 'user' && m.text.trim());
      if (firstUser) {
        active.title = firstUser.text.trim().slice(0, 32) + (firstUser.text.trim().length > 32 ? '…' : '');
      }
    }
  }

  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    if (activeConversationId) {
      localStorage.setItem(ACTIVE_CONV_KEY, activeConversationId);
    }
  } catch {
    showToast('Failed to save to localStorage. Storage may be full.');
  }

  renderRecentList();
  updateChatTitleDisplay();
}

function createConversation() {
  const newConv = {
    id: (crypto.randomUUID ? crypto.randomUUID() : `cf-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: 'New conversation',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  conversations.unshift(newConv);
  activeConversationId = newConv.id;
  history = [];

  saveConversations();
  renderChatMessages();
  $('#promptInput').value = '';
  $('#promptInput').focus();
  document.body.classList.remove('sidebar-open');
}

function openConversation(id) {
  if (busy) {
    return showToast('Please wait for the current response to finish.');
  }
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;

  activeConversationId = id;
  history = Array.isArray(conv.messages) ? conv.messages.slice() : [];
  renderChatMessages();
  renderRecentList();
  updateChatTitleDisplay();
  document.body.classList.remove('sidebar-open');
  $('#promptInput').focus();
}

function deleteConversation(id, e) {
  if (e) e.stopPropagation();
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;

  conversations = conversations.filter((c) => c.id !== id);

  if (activeConversationId === id) {
    if (conversations.length > 0) {
      openConversation(conversations[0].id);
    } else {
      createConversation();
    }
  } else {
    saveConversations();
  }

  showToast('Conversation deleted.');
}

function renameConversation(id) {
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;

  const newTitle = window.prompt('Rename conversation:', conv.title || '');
  if (newTitle && newTitle.trim()) {
    conv.title = newTitle.trim();
    saveConversations();
    showToast('Renamed conversation.');
  }
}

function updateChatTitleDisplay() {
  const active = conversations.find((c) => c.id === activeConversationId);
  const title = active ? active.title || 'New conversation' : 'New conversation';
  $('#subheaderLeft').textContent = title;
  $('#subheaderLeft').title = title;
}

$('#renameChatBtn').addEventListener('click', () => {
  if (activeConversationId) renameConversation(activeConversationId);
});

$('#subheaderLeft').addEventListener('click', () => {
  if (activeConversationId) renameConversation(activeConversationId);
});

function renderRecentList(filterQuery = '') {
  const list = $('#recentList');
  if (!list) return;

  list.replaceChildren();

  const query = (filterQuery || '').toLowerCase().trim();
  const filtered = conversations
    .filter((c) => !query || (c.title || '').toLowerCase().includes(query))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  $('#chatsCount').textContent = filtered.length;

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recent-empty';
    empty.textContent = query ? 'No matching conversations' : 'No conversations yet';
    list.appendChild(empty);
    return;
  }

  filtered.forEach((conv) => {
    const row = document.createElement('div');
    row.className = `recent-entry ${conv.id === activeConversationId ? 'active' : ''}`;

    const titleBtn = document.createElement('button');
    titleBtn.className = 'recent-item';
    titleBtn.textContent = conv.title || 'New conversation';
    titleBtn.title = conv.title || 'New conversation';
    titleBtn.addEventListener('click', () => openConversation(conv.id));

    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'entry-btn';
    renameBtn.title = 'Rename';
    renameBtn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renameConversation(conv.id);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'entry-btn delete';
    delBtn.title = 'Delete';
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';
    delBtn.addEventListener('click', (e) => deleteConversation(conv.id, e));

    actions.append(renameBtn, delBtn);
    row.append(titleBtn, actions);
    list.appendChild(row);
  });
}

// Live search in conversations
$('#chatSearchInput').addEventListener('input', (e) => {
  renderRecentList(e.target.value);
});

// New Chat button (button removed from UI; kept for Ctrl+N shortcut)
const _newChatBtn = $('#newChatBtn');
if (_newChatBtn) {
  _newChatBtn.addEventListener('click', () => {
    if (busy) return showToast('Please wait for the current reply to finish.');
    createConversation();
  });
}

// Clear all chats
$('#clearAllChatsBtn').addEventListener('click', () => {
  if (!conversations.length) return showToast('No conversations to clear.');
  conversations = [];
  localStorage.removeItem(CONVERSATIONS_KEY);
  localStorage.removeItem(ACTIVE_CONV_KEY);
  createConversation();
  showToast('All conversations cleared.');
});

// Export conversations
$('#exportChatsBtn').addEventListener('click', () => {
  const active = conversations.find((c) => c.id === activeConversationId);
  if (!active || !history.length) return showToast('No chat history to export.');

  const mdContent = `# ChatFlow AI Export: ${active.title || 'Conversation'}\n*Exported on ${new Date().toLocaleString()}*\n\n` +
    history.map((m) => `### **${m.role === 'user' ? 'User' : 'ChatFlow AI'}**:\n\n${m.text}\n\n---`).join('\n\n');

  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(active.title || 'conversation').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported conversation as Markdown.');
});

// -----------------------------------------------------------------------------
// MARKDOWN & SYNTAX HIGHLIGHTING RENDERING
// -----------------------------------------------------------------------------
function renderMarkdownContent(rawText) {
  if (!rawText) return '';

  // Configure marked if available
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  let html = window.marked ? marked.parse(rawText) : rawText;

  // Sanitize with DOMPurify
  if (window.DOMPurify) {
    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ['iframe', 'button', 'span', 'kbd'],
      ADD_ATTR: ['target', 'class', 'data-code', 'data-lang'],
    });
  }

  return html;
}

// Post-process message DOM: syntax highlighting, math, code block header with copy & send-to-studio buttons
function enrichMessageElement(contentEl, rawText) {
  // Highlight code blocks
  contentEl.querySelectorAll('pre code').forEach((block) => {
    if (window.hljs) {
      hljs.highlightElement(block);
    }

    const pre = block.closest('pre');
    if (!pre || pre.closest('.code-block-wrapper')) return;

    // Detect language class
    const langClass = Array.from(block.classList).find((c) => c.startsWith('language-'));
    const langName = langClass ? langClass.replace('language-', '').toUpperCase() : 'CODE';

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';

    const header = document.createElement('div');
    header.className = 'code-block-header';
    header.innerHTML = `<span>${langName}</span>`;

    const actions = document.createElement('div');
    actions.className = 'code-block-actions';

    // Copy Code Button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-action-btn';
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(block.textContent);
      copyBtn.innerHTML = '<span>✓ Copied</span>';
      setTimeout(() => {
        copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>';
      }, 2000);
      showToast('Code copied to clipboard.');
    });

    actions.append(copyBtn);
    header.appendChild(actions);

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });

  // Render LaTeX math formulas if KaTeX is loaded
  if (window.renderMathInElement) {
    try {
      renderMathInElement(contentEl, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      });
    } catch {
      // Ignore KaTeX formatting errors
    }
  }
}

// -----------------------------------------------------------------------------
// CHAT RENDERING
// -----------------------------------------------------------------------------
function renderChatMessages() {
  const container = $('#messages');
  container.replaceChildren();

  const isEmpty = history.length === 0;
  $('#chatEmpty').hidden = !isEmpty;

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    appendMessageElement(item.role === 'user' ? 'user' : 'assistant', item.text, {
      images: item.images,
      stats: item.stats,
      index: i,
    });
  }

  scrollChatToBottom(true);
}

function appendMessageElement(role, text, options = {}) {
  const container = $('#messages');
  const row = document.createElement('div');
  row.className = `message ${role}`;

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'YOU' : 'CF';

  // Body Wrapper
  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'message-body-wrap';

  // If message has image attachments
  if (options.images && options.images.length > 0) {
    const thumbsWrap = document.createElement('div');
    thumbsWrap.className = 'msg-attachments';
    options.images.forEach((img) => {
      const imgTag = document.createElement('img');
      imgTag.src = img.data || img;
      imgTag.className = 'msg-thumb';
      thumbsWrap.appendChild(imgTag);
    });
    bodyWrap.appendChild(thumbsWrap);
  }

  // Content
  const content = document.createElement('div');
  content.className = `message-content ${options.error ? 'error' : ''}`;

  if (role === 'assistant' && !options.error) {
    content.innerHTML = renderMarkdownContent(text);
    enrichMessageElement(content, text);
  } else {
    content.textContent = text;
  }

  bodyWrap.appendChild(content);

  // Assistant Action Buttons
  if (role === 'assistant' && !options.error && text.trim()) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    // Copy message
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.title = 'Copy message';
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text);
      showToast('Message copied!');
    });

    // Read Aloud (Text-to-Speech)
    const ttsBtn = document.createElement('button');
    ttsBtn.className = 'action-btn';
    ttsBtn.title = 'Read aloud';
    ttsBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg><span>Listen</span>';
    ttsBtn.addEventListener('click', () => toggleTextToSpeech(text, ttsBtn));

    // Regenerate
    const regenBtn = document.createElement('button');
    regenBtn.className = 'action-btn';
    regenBtn.title = 'Regenerate response';
    regenBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg><span>Regenerate</span>';
    regenBtn.addEventListener('click', () => {
      if (busy) return showToast('Please wait for current turn to complete.');
      regenerateFromIndex(options.index);
    });

    // Thumbs up / down
    const likeBtn = document.createElement('button');
    likeBtn.className = 'action-btn';
    likeBtn.title = 'Good response';
    likeBtn.innerHTML = '👍';
    likeBtn.addEventListener('click', () => {
      likeBtn.classList.toggle('active-like');
      showToast('Thank you for your feedback!');
    });

    actions.append(copyBtn, ttsBtn, regenBtn, likeBtn);

    // Performance Stats badge
    if (options.stats) {
      const statsBadge = document.createElement('span');
      statsBadge.className = 'msg-perf-badge';
      statsBadge.textContent = `${options.stats.latencyMs || 0}ms • ~${options.stats.tokenEstimate || 0} tokens`;
      actions.appendChild(statsBadge);
    }

    bodyWrap.appendChild(actions);
  }

  row.append(avatar, bodyWrap);
  container.appendChild(row);

  return { row, content, bodyWrap };
}

function scrollChatToBottom(force = false) {
  const scroller = $('#chatScroll');
  if (!scroller) return;
  const isNearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 180;
  if (force || isNearBottom) {
    scroller.scrollTop = scroller.scrollHeight;
  }
}

// -----------------------------------------------------------------------------
// TEXT TO SPEECH (VOICE PLAYBACK)
// -----------------------------------------------------------------------------
function toggleTextToSpeech(text, btn) {
  if (!('speechSynthesis' in window)) {
    return showToast('Text-to-speech is not supported by your browser.');
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg><span>Listen</span>';
    return;
  }

  const cleanText = text.replace(/[*_#`>-]/g, '').slice(0, 800);
  speechUtterance = new SpeechSynthesisUtterance(cleanText);
  speechUtterance.rate = 1.0;
  speechUtterance.pitch = 1.0;

  speechUtterance.onstart = () => {
    btn.innerHTML = '<span style="color:var(--primary)">■ Stop</span>';
  };

  speechUtterance.onend = () => {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg><span>Listen</span>';
  };

  speechUtterance.onerror = () => {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg><span>Listen</span>';
  };

  window.speechSynthesis.speak(speechUtterance);
}

// -----------------------------------------------------------------------------
// VOICE DICTATION (SPEECH TO TEXT)
// -----------------------------------------------------------------------------
function setupVoiceRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceBtn = $('#voiceBtn');

  if (!SpeechRec) {
    voiceBtn.title = 'Speech-to-text not supported in this browser';
    voiceBtn.style.opacity = '0.5';
    return;
  }

  recognition = new SpeechRec();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    voiceBtn.classList.add('recording');
    showToast('Listening... Speak into your microphone');
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const input = $('#promptInput');
    input.value = (input.value ? input.value + ' ' : '') + transcript;
    autoResizeTextarea(input);
  };

  recognition.onend = () => {
    isRecording = false;
    voiceBtn.classList.remove('recording');
  };

  recognition.onerror = (e) => {
    isRecording = false;
    voiceBtn.classList.remove('recording');
    showToast(`Microphone error: ${e.error || 'Failed'}`);
  };

  voiceBtn.addEventListener('click', () => {
    if (isRecording) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });
}

// -----------------------------------------------------------------------------
// MULTIMODAL FILE & IMAGE ATTACHMENTS
// -----------------------------------------------------------------------------
const fileInput = $('#fileInput');
const attachBtn = $('#attachBtn');
const attachmentsPreview = $('#attachmentsPreview');

attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  handleSelectedFiles(Array.from(e.target.files));
  fileInput.value = '';
});

function handleSelectedFiles(files) {
  if (!files || !files.length) return;

  files.forEach((file) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        attachedImages.push({
          name: file.name,
          mimeType: file.type,
          data: ev.target.result,
        });
        renderAttachmentsPreview();
      };
      reader.readAsDataURL(file);
    } else {
      // Text or code file
      const reader = new FileReader();
      reader.onload = (ev) => {
        const input = $('#promptInput');
        const appendText = `\n\n\`\`\`${file.name}\n${ev.target.result}\n\`\`\`\n`;
        input.value = (input.value ? input.value + appendText : appendText);
        autoResizeTextarea(input);
        showToast(`Attached ${file.name} to message.`);
      };
      reader.readAsText(file);
    }
  });
}

function renderAttachmentsPreview() {
  attachmentsPreview.replaceChildren();
  if (attachedImages.length === 0) {
    attachmentsPreview.hidden = true;
    return;
  }

  attachmentsPreview.hidden = false;
  attachedImages.forEach((img, idx) => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';

    const thumb = document.createElement('img');
    thumb.src = img.data;

    const name = document.createElement('span');
    name.textContent = img.name.length > 12 ? img.name.slice(0, 10) + '…' : img.name;

    const del = document.createElement('span');
    del.className = 'attachment-chip-del';
    del.innerHTML = '&times;';
    del.addEventListener('click', () => {
      attachedImages.splice(idx, 1);
      renderAttachmentsPreview();
    });

    chip.append(thumb, name, del);
    attachmentsPreview.appendChild(chip);
  });
}

// Drag & drop into chat area
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    handleSelectedFiles(Array.from(e.dataTransfer.files));
  }
});

// Clipboard paste images
window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      const file = items[i].getAsFile();
      if (file) handleSelectedFiles([file]);
    }
  }
});

// -----------------------------------------------------------------------------
// CHAT ENGINE: REAL-TIME SSE STREAMING
// -----------------------------------------------------------------------------
async function sendMessage(text) {
  text = String(text || '').trim();
  if (!text || busy) return;

  busy = true;
  $('#sendBtn').hidden = true;
  $('#stopBtn').hidden = false;
  $('#promptInput').disabled = true;
  $('#chatEmpty').hidden = true;

  const currentAttached = [...attachedImages];
  attachedImages = [];
  renderAttachmentsPreview();

  // Push user message to history
  history.push({
    role: 'user',
    text,
    images: currentAttached.length ? currentAttached : undefined,
  });
  saveConversations();

  // Render user message
  appendMessageElement('user', text, { images: currentAttached });
  scrollChatToBottom(true);

  // Create assistant placeholder row for live streaming
  const { content, row, bodyWrap } = appendMessageElement('assistant', '', {});
  // Show loading dots while waiting for first token
  const loadingDots = document.createElement('span');
  loadingDots.className = 'loading-dots';
  loadingDots.innerHTML = '<span></span><span></span><span></span>';
  content.appendChild(loadingDots);
  const cursor = document.createElement('span');
  cursor.className = 'streaming-cursor';
  scrollChatToBottom(true);

  // Setup AbortController
  abortController = new AbortController();

  // Model & System Instruction Config
  const selectedModel = $('#model-select').value;
  const prefs = getPrefs();
  const storedKeys = getStoredApiKeys();

  const systemInstruction = prefs.customSystemPrompt || PERSONAS[activePersona] || PERSONAS.general;
  const temperature = parseFloat(prefs.temperature ?? 0.7);

  const payload = {
    messages: history.map((h) => ({ role: h.role, text: h.text })),
    model: selectedModel,
    stream: true,
    temperature,
    systemInstruction,
    images: currentAttached,
  };

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  if (storedKeys.geminiKey) headers['x-gemini-key'] = storedKeys.geminiKey;
  if (storedKeys.groqKey) headers['x-groq-key'] = storedKeys.groqKey;

  const startTime = Date.now();
  let accumulatedText = '';
  let streamStats = null;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `Server responded with status ${response.status}`);
    }

    // Read SSE Stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep last incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.text) {
            accumulatedText += parsed.text;
            // Remove loading dots on first token
            if (loadingDots.parentNode) loadingDots.remove();
            content.innerHTML = renderMarkdownContent(accumulatedText);
            content.appendChild(cursor);
            scrollChatToBottom(false);
          }
          if (parsed.stats) {
            streamStats = parsed.stats;
          }
        } catch {
          // Non-JSON or chunk parsing edge case
        }
      }
    }

    // Stream finished successfully
    cursor.remove();
    if (loadingDots.parentNode) loadingDots.remove();
    content.innerHTML = renderMarkdownContent(accumulatedText);
    enrichMessageElement(content, accumulatedText);

    const latency = Date.now() - startTime;
    const tokenEst = Math.round(accumulatedText.length / 4);
    const statsObj = streamStats || { latencyMs: latency, tokenEstimate: tokenEst };

    // Save assistant message to history
    history.push({
      role: 'assistant',
      text: accumulatedText,
      stats: statsObj,
    });
    saveConversations();

    // Re-render message row to add action buttons cleanly
    row.remove();
    appendMessageElement('assistant', accumulatedText, {
      stats: statsObj,
      index: history.length - 1,
    });

    playChime('success');
  } catch (err) {
    cursor.remove();
    if (loadingDots.parentNode) loadingDots.remove();
    if (err.name === 'AbortError') {
      content.innerHTML = renderMarkdownContent(accumulatedText + '\n\n*(Generation stopped by user)*');
      enrichMessageElement(content, accumulatedText);
      history.push({
        role: 'assistant',
        text: accumulatedText || '(Stopped by user)',
      });
      saveConversations();
      showToast('Generation cancelled.');
    } else {
      content.classList.add('error');
      content.textContent = `Error: ${err.message || 'Something went wrong.'}`;
      playChime('error');
    }
  } finally {
    busy = false;
    abortController = null;
    $('#sendBtn').hidden = false;
    $('#stopBtn').hidden = true;
    $('#promptInput').disabled = false;
    $('#promptInput').focus();
    scrollChatToBottom(true);
  }
}

// Stop Button Handler
$('#stopBtn').addEventListener('click', () => {
  if (abortController) {
    abortController.abort();
  }
});

// Regenerate from index
function regenerateFromIndex(msgIndex) {
  if (msgIndex === undefined || msgIndex < 1) {
    msgIndex = history.length - 1;
  }
  const lastUserIdx = msgIndex - 1;
  if (lastUserIdx >= 0 && history[lastUserIdx].role === 'user') {
    const userPrompt = history[lastUserIdx].text;
    history = history.slice(0, lastUserIdx);
    saveConversations();
    renderChatMessages();
    sendMessage(userPrompt);
  }
}

// Auto-resizing textarea & char counter
const promptInput = $('#promptInput');
function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  $('#charCounter').textContent = `${el.value.length} chars`;
}

promptInput.addEventListener('input', () => autoResizeTextarea(promptInput));

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const val = promptInput.value.trim();
    if (val) {
      promptInput.value = '';
      autoResizeTextarea(promptInput);
      sendMessage(val);
    }
  }
});

$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const val = promptInput.value.trim();
  if (val) {
    promptInput.value = '';
    autoResizeTextarea(promptInput);
    sendMessage(val);
  }
});

// Prompt Chips Click Handlers
$$('.chip[data-prompt]').forEach((chip) => {
  chip.addEventListener('click', () => {
    const prompt = chip.dataset.prompt;
    promptInput.value = prompt;
    autoResizeTextarea(promptInput);
    promptInput.focus();
  });
});

// -----------------------------------------------------------------------------
// SETTINGS PANEL & API KEY VERIFICATION
// -----------------------------------------------------------------------------
function loadSettingsUI() {
  const prefs = getPrefs();
  const keys = getStoredApiKeys();

  if (keys.geminiKey) $('#customGeminiKey').value = keys.geminiKey;
  if (keys.groqKey) $('#customGroqKey').value = keys.groqKey;

  if (prefs.defaultModel) $('#settingsModel').value = prefs.defaultModel;
  if (prefs.temperature !== undefined) {
    $('#temperatureSlider').value = prefs.temperature;
    $('#tempDisplay').textContent = prefs.temperature;
  }
  if (prefs.customSystemPrompt) $('#customSystemPrompt').value = prefs.customSystemPrompt;
  if (prefs.theme) $('#themeSelect').value = prefs.theme;
  if (prefs.compact) {
    $('#compactMode').checked = true;
    document.body.classList.add('compact');
  }
  if (prefs.soundEffects !== undefined) {
    $('#soundEffects').checked = prefs.soundEffects;
  }
}

// Temperature slider live feedback
$('#temperatureSlider').addEventListener('input', (e) => {
  $('#tempDisplay').textContent = e.target.value;
});

// Reveal password toggle
$$('.btn-reveal').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = $(`#${btn.dataset.target}`);
    if (target.type === 'password') {
      target.type = 'text';
      btn.textContent = '🔒';
    } else {
      target.type = 'password';
      btn.textContent = '👁️';
    }
  });
});

// Test Gemini Key
$('#testGeminiKeyBtn').addEventListener('click', async () => {
  const key = $('#customGeminiKey').value.trim();
  const status = $('#geminiKeyStatus');
  if (!key) return showToast('Please enter a Gemini API key first.');

  status.className = 'key-status-msg';
  status.textContent = 'Testing key connectivity...';

  try {
    const res = await fetch('/api/verify-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiKey: key }),
    });
    const data = await res.json();
    if (data.gemini.valid) {
      status.className = 'key-status-msg ok';
      status.textContent = '✓ ' + data.gemini.message;
      playChime('success');
    } else {
      status.className = 'key-status-msg error';
      status.textContent = '✗ ' + data.gemini.message;
      playChime('error');
    }
  } catch (err) {
    status.className = 'key-status-msg error';
    status.textContent = 'Error: ' + err.message;
  }
});

// Test Groq Key
$('#testGroqKeyBtn').addEventListener('click', async () => {
  const key = $('#customGroqKey').value.trim();
  const status = $('#groqKeyStatus');
  if (!key) return showToast('Please enter a Groq API key first.');

  status.className = 'key-status-msg';
  status.textContent = 'Testing key connectivity...';

  try {
    const res = await fetch('/api/verify-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groqKey: key }),
    });
    const data = await res.json();
    if (data.groq.valid) {
      status.className = 'key-status-msg ok';
      status.textContent = '✓ ' + data.groq.message;
      playChime('success');
    } else {
      status.className = 'key-status-msg error';
      status.textContent = '✗ ' + data.groq.message;
      playChime('error');
    }
  } catch (err) {
    status.className = 'key-status-msg error';
    status.textContent = 'Error: ' + err.message;
  }
});

// Save Keys
$('#saveKeysBtn').addEventListener('click', () => {
  const geminiKey = $('#customGeminiKey').value.trim();
  const groqKey = $('#customGroqKey').value.trim();
  saveStoredApiKeys({ geminiKey, groqKey });
  checkBackendHealth();
  showToast('API keys saved locally in your browser!');
});

// Remove Keys
$('#clearKeysBtn').addEventListener('click', () => {
  $('#customGeminiKey').value = '';
  $('#customGroqKey').value = '';
  saveStoredApiKeys({});
  checkBackendHealth();
  showToast('Custom API keys removed from browser.');
});

// Save Preferences
$('#confirmPrefs').addEventListener('click', () => {
  const defaultModel = $('#settingsModel').value;
  const temperature = parseFloat($('#temperatureSlider').value);
  const customSystemPrompt = $('#customSystemPrompt').value.trim();
  const theme = $('#themeSelect').value;
  const compact = $('#compactMode').checked;
  const soundEffects = $('#soundEffects').checked;

  savePrefs({ defaultModel, temperature, customSystemPrompt, theme, compact, soundEffects });

  applyTheme(theme);
  document.body.classList.toggle('compact', compact);
  $('#model-select').value = defaultModel;

  showToast('Workspace preferences saved!');
});

// -----------------------------------------------------------------------------
// COMMAND PALETTE (CMD+K)
// -----------------------------------------------------------------------------
const cmdPaletteModal = $('#cmdPaletteModal');
const paletteInput = $('#paletteInput');
const paletteResults = $('#paletteResults');

const PALETTE_COMMANDS = [
  { label: 'Start New Conversation', icon: '💬', kbd: '⌘N', action: () => { switchTab('chat'); createConversation(); } },
  { label: 'Switch to Gemini 3.8 Flash', icon: '🌟', kbd: '', action: () => { $('#model-select').value = 'gemini-3.8-flash'; showToast('Model set to Gemini 3.8 Flash'); } },
  { label: 'Switch to Gemini 3 Pro', icon: '🧠', kbd: '', action: () => { $('#model-select').value = 'gemini-3-pro'; showToast('Model set to Gemini 3 Pro'); } },
  { label: 'Switch to Groq Llama 3.3', icon: '⚡', kbd: '', action: () => { $('#model-select').value = 'groq-llama-3.3-70b'; showToast('Model set to Groq Llama 3.3'); } },
  { label: 'Open Preferences & Settings', icon: '⚙️', kbd: 'Ctrl+2', action: () => switchTab('settings') },
  { label: 'Toggle Dark / Light Theme', icon: '🌓', kbd: '', action: () => $('#themeToggleBtn').click() },
  { label: 'Export Current Conversation', icon: '📥', kbd: '', action: () => $('#exportChatsBtn').click() },
  { label: 'Clear All Saved Conversations', icon: '🗑️', kbd: '', action: () => $('#clearAllChatsBtn').click() },
  { label: 'View Keyboard Shortcuts', icon: '⌨️', kbd: '?', action: () => openShortcutsModal() },
];

function openCommandPalette() {
  cmdPaletteModal.hidden = false;
  paletteInput.value = '';
  renderPaletteResults();
  paletteInput.focus();
}

function closeCommandPalette() {
  cmdPaletteModal.hidden = true;
}

function renderPaletteResults(query = '') {
  paletteResults.replaceChildren();
  const q = query.toLowerCase().trim();
  const filtered = PALETTE_COMMANDS.filter((cmd) => !q || cmd.label.toLowerCase().includes(q));

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.style.padding = '12px';
    empty.style.color = 'var(--text-muted)';
    empty.textContent = 'No matching commands.';
    paletteResults.appendChild(empty);
    return;
  }

  filtered.forEach((cmd, idx) => {
    const item = document.createElement('div');
    item.className = `palette-item ${idx === 0 ? 'active' : ''}`;
    item.innerHTML = `
      <span>${cmd.icon}</span>
      <span>${cmd.label}</span>
      ${cmd.kbd ? `<kbd>${cmd.kbd}</kbd>` : ''}
    `;
    item.addEventListener('click', () => {
      closeCommandPalette();
      cmd.action();
    });
    paletteResults.appendChild(item);
  });
}

paletteInput.addEventListener('input', (e) => renderPaletteResults(e.target.value));

paletteInput.addEventListener('keydown', (e) => {
  const items = $$('.palette-item');
  let activeIdx = Array.from(items).findIndex((it) => it.classList.contains('active'));

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (activeIdx < items.length - 1) {
      items[activeIdx]?.classList.remove('active');
      items[activeIdx + 1]?.classList.add('active');
      items[activeIdx + 1]?.scrollIntoView({ block: 'nearest' });
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (activeIdx > 0) {
      items[activeIdx]?.classList.remove('active');
      items[activeIdx - 1]?.classList.add('active');
      items[activeIdx - 1]?.scrollIntoView({ block: 'nearest' });
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    items[activeIdx]?.click();
  } else if (e.key === 'Escape') {
    closeCommandPalette();
  }
});

$('#cmdPaletteBtn').addEventListener('click', openCommandPalette);
cmdPaletteModal.addEventListener('click', (e) => {
  if (e.target === cmdPaletteModal) closeCommandPalette();
});

// -----------------------------------------------------------------------------
// SHORTCUTS MODAL
// -----------------------------------------------------------------------------
const shortcutsModal = $('#shortcutsModal');
function openShortcutsModal() { shortcutsModal.hidden = false; }
function closeShortcutsModal() { shortcutsModal.hidden = true; }

$('#shortcutsBtn').addEventListener('click', openShortcutsModal);
$('#closeShortcutsBtn').addEventListener('click', closeShortcutsModal);
shortcutsModal.addEventListener('click', (e) => {
  if (e.target === shortcutsModal) closeShortcutsModal();
});

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (cmdPaletteModal.hidden) openCommandPalette();
    else closeCommandPalette();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    createConversation();
  } else if ((e.metaKey || e.ctrlKey) && e.key === '1') {
    e.preventDefault();
    switchTab('chat');
  } else if ((e.metaKey || e.ctrlKey) && (e.key === '2' || e.key === '4')) {
    e.preventDefault();
    switchTab('settings');
  } else if (e.key === 'Escape') {
    closeCommandPalette();
    closeShortcutsModal();
    if (busy && abortController) {
      abortController.abort();
    }
  } else if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    e.preventDefault();
    if (shortcutsModal.hidden) openShortcutsModal();
    else closeShortcutsModal();
  }
});

// -----------------------------------------------------------------------------
// APPLICATION BOOTSTRAP
// -----------------------------------------------------------------------------
function bootstrap() {
  const prefs = getPrefs();

  // Apply theme
  applyTheme(prefs.theme || 'dark');

  // Load Settings
  loadSettingsUI();

  // Setup Voice Recognition
  setupVoiceRecognition();

  // Check Backend
  checkBackendHealth();

  // Load Conversations
  conversations = loadConversations();
  if (!conversations.length) {
    conversations = [{
      id: (crypto.randomUUID ? crypto.randomUUID() : `cf-${Date.now()}`),
      title: 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
  }

  const lastActiveId = localStorage.getItem(ACTIVE_CONV_KEY);
  activeConversationId = conversations.some((c) => c.id === lastActiveId)
    ? lastActiveId
    : conversations[0].id;

  history = (conversations.find((c) => c.id === activeConversationId)?.messages || []).slice();

  renderChatMessages();
  renderRecentList();
  updateChatTitleDisplay();

  $('#promptInput')?.focus();
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', bootstrap);
