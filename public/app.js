const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* ---------- state ---------- */
let history = [];
let conversations = [];
let activeConversationId = null;
let busy = false;
let toastTimer;
const STORAGE_KEY = 'chatflow-history-v2';
const CONVERSATIONS_KEY = 'chatflow-conversations-v1';
const PREF_KEY = 'chatflow-prefs-v2';
const CLIENT_MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/* ---------- tabs ---------- */
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === target));
    const left = $('#subheaderLeft');
    if (target === 'chat') left.textContent = 'New conversation';
    if (target === 'compare') left.textContent = 'Compare';
    if (target === 'studio') left.textContent = 'Studio';
    if (target === 'settings') left.textContent = 'Preferences';
  });
});

/* ---------- mobile menu ---------- */
const menuBtn = document.querySelector('.brand-mark');
const overlay = document.createElement('div');
overlay.className = 'sidebar-overlay';
document.body.appendChild(overlay);
menuBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
overlay.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

/* ---------- toast ---------- */
const toast = document.createElement('div');
toast.className = 'toast';
document.body.appendChild(toast);
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ---------- utils ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/* ---------- chat elements ---------- */
const form = $('#chatForm');
const input = $('#promptInput');
const messagesEl = $('#messages');
const chatEmpty = $('#chatEmpty');
const sendBtn = $('#sendBtn');

/* ---------- chat persistence ---------- */
function loadHistory() {
  try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function saveHistory() {
  const active = conversations.find((c) => c.id === activeConversationId);
  if (active) {
    active.messages = history.slice();
    active.updatedAt = Date.now();
    if (!active.title || active.title === 'New conversation') {
      const firstUser = history.find((m) => m.role === 'user' && m.text.trim());
      if (firstUser) active.title = firstUser.text.trim().slice(0, 34) + (firstUser.text.trim().length > 34 ? '…' : '');
    }
  }
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    if (activeConversationId) localStorage.setItem('chatflow-active-conversation-v1', activeConversationId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40)));
  } catch { showToast('Could not save chats. Browser storage may be full.'); }
  renderRecentChats();
}
function createConversation() {
  const conversation = {
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: 'New conversation', messages: [], createdAt: Date.now(), updatedAt: Date.now()
  };
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  history = [];
  saveHistory();
  renderConversation();
  renderRecentChats();
  $('#subheaderLeft').textContent = conversation.title;
  document.body.classList.remove('sidebar-open');
  input.value = '';
  input.focus();
}
function renderConversation() {
  messagesEl.replaceChildren();
  const hasMessages = history.length > 0;
  chatEmpty.hidden = hasMessages;
  for (const item of history) { addMessage(item.role === 'user' ? 'user' : 'assistant', item.text); }
  scrollChat(true);
}
function openConversation(id) {
  if (busy) return showToast('Wait for the current reply to finish.');
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return;
  activeConversationId = id;
  history = Array.isArray(conversation.messages) ? conversation.messages.slice() : [];
  renderConversation();
  renderRecentChats();
  $('#subheaderLeft').textContent = conversation.title || 'New conversation';
  document.body.classList.remove('sidebar-open');
  input.focus();
}
function deleteConversation(id) {
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return;
  if (!window.confirm(`Delete "${conversation.title || 'New conversation'}"?`)) return;
  conversations = conversations.filter((c) => c.id !== id);
  if (activeConversationId === id) {
    activeConversationId = null; history = [];
    if (conversations.length) openConversation(conversations[0].id);
    else createConversation();
  } else { saveHistory(); }
  renderRecentChats();
  showToast('Conversation deleted.');
}
function renderRecentChats() {
  const list = $('#recentList');
  if (!list) return;
  list.replaceChildren();
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  if (!sorted.length) {
    const empty = document.createElement('p');
    empty.className = 'recent-empty'; empty.textContent = 'No conversations yet';
    list.appendChild(empty); return;
  }
  sorted.forEach((conversation) => {
    const item = document.createElement('div');
    item.className = `recent-entry${conversation.id === activeConversationId ? ' active' : ''}`;
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'recent-item';
    open.textContent = conversation.title || 'New conversation';
    open.title = conversation.title || 'New conversation';
    open.addEventListener('click', () => openConversation(conversation.id));
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'recent-delete'; del.textContent = '×';
    del.addEventListener('click', () => deleteConversation(conversation.id));
    item.append(open, del);
    list.appendChild(item);
  });
}

/* ---------- chat rendering ---------- */
function addMessage(role, text, opts = {}) {
  const row = document.createElement('div');
  row.className = `message ${role}`;
  const av = document.createElement('div');
  av.className = 'message-avatar';
  av.textContent = role === 'user' ? 'You' : 'CF';
  const c = document.createElement('div');
  c.className = 'message-content';
  if (role === 'assistant' && !opts.error && text.trim() !== '') {
    c.innerHTML = DOMPurify.sanitize(marked.parse(text));
  } else { c.textContent = text; }
  if (opts.error) c.classList.add('error');
  row.append(av, c);
  messagesEl.append(row);
  return { row, content: c };
}
function showTyping() {
  const row = document.createElement('div');
  row.className = 'message assistant'; row.id = 'typingIndicator';
  const av = document.createElement('div');
  av.className = 'message-avatar'; av.textContent = 'CF';
  const dots = document.createElement('div');
  dots.className = 'typing'; dots.innerHTML = '<span></span><span></span><span></span>';
  row.append(av, dots); messagesEl.append(row);
}
function removeTyping() { $('#typingIndicator')?.remove(); }
function scrollChat(force = false) {
  const scroller = $('#chatScroll');
  if (!scroller) return;
  const isNearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 150;
  if (force || isNearBottom) scroller.scrollTop = scroller.scrollHeight;
}

/* ---------- chat networking ---------- */
async function postChat(payload) {
  const r = await fetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `Request failed (${r.status})`);
    err.status = r.status; throw err;
  }
  return data;
}
function isRetryable(error) {
  if (!error) return false;
  if (!error.status) return true;
  return RETRYABLE_STATUS.has(error.status);
}
function attachRetryButton(content, userText) {
  content.querySelectorAll('.retry-btn').forEach((b) => b.remove());
  const btn = document.createElement('button');
  btn.className = 'retry-btn'; btn.type = 'button';
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg> <span>Retry</span>';
  btn.addEventListener('click', () => {
    if (busy) return;
    const row = content.closest('.message');
    const idx = history.map((h) => h.role + ':' + h.text).lastIndexOf('user:' + userText);
    if (idx >= 0) { history = history.slice(0, idx); saveHistory(); }
    row?.remove(); sendMessage(userText, { retry: true });
  });
  content.appendChild(document.createElement('br'));
  content.appendChild(btn);
}

/* ---------- Typewriter Effect ---------- */
async function typeWriter(element, text) {
  element.innerHTML = '';
  const lines = text.split('\n');
  let accumulatedHTML = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j += 2) {
      const currentText = accumulatedHTML + line.substring(0, j + 2);
      element.innerHTML = DOMPurify.sanitize(currentText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'));
      scrollChat(false); await sleep(10);
    }
    accumulatedHTML += line + '\n';
    element.innerHTML = DOMPurify.sanitize(marked.parse(accumulatedHTML));
    await sleep(20);
  }
  element.innerHTML = DOMPurify.sanitize(marked.parse(text));
}

/* ---------- Action Buttons ---------- */
function addActionButtons(content, text) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  
  const copyBtn = document.createElement('button');
  copyBtn.className = 'action-btn'; copyBtn.title = 'Copy';
  copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  copyBtn.onclick = () => { navigator.clipboard.writeText(text); showToast('Copied!'); };

  const retryBtn = document.createElement('button');
  retryBtn.className = 'action-btn'; retryBtn.title = 'Retry';
  retryBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';
  retryBtn.onclick = () => {
    if (busy) return;
    const idx = history.map((h) => h.role + ':' + h.text).lastIndexOf('model:' + text);
    if (idx > 0) {
      const userText = history[idx - 1].text;
      history = history.slice(0, idx - 1); saveHistory();
      content.closest('.message').remove(); sendMessage(userText, { retry: true });
    }
  };

  actions.append(copyBtn, retryBtn);
  content.appendChild(actions);
}

/* ---------- send message ---------- */
async function sendMessage(text, options = {}) {
  text = String(text || '').trim();
  if (!text || busy) return;
  busy = true; sendBtn.disabled = true; input.disabled = true; chatEmpty.hidden = true;
  history.push({ role: 'user', text });
  saveHistory(); addMessage('user', text); showTyping(); scrollChat(true);

  let lastError = null;
  let attempts = 1;

  while (attempts <= CLIENT_MAX_ATTEMPTS) {
    try {
      const selectedModel = $('#modelSelect').value;
      let modelParam = 'gemini'; 
      if (selectedModel.includes('DeepSeek') || selectedModel.includes('Fast')) { modelParam = 'deepseek'; }

      const data = await postChat({ messages: history, model: modelParam });
      removeTyping();
      const answer = String(data.answer || '').trim() || 'No response.';
      history.push({ role: 'model', text: answer }); saveHistory();
      const { content } = addMessage('assistant', ''); scrollChat(true); await sleep(100);
      await typeWriter(content, answer); addActionButtons(content, answer);
      busy = false; sendBtn.disabled = false; input.disabled = false; input.focus(); scrollChat(false);
      return;
    } catch (e) {
      lastError = e;
      const canRetry = isRetryable(e) && attempts < CLIENT_MAX_ATTEMPTS;
      if (!canRetry) break;
      const delay = 1000 * Math.pow(2, attempts - 1);
      showToast(`Retrying in ${delay / 1000}s…`);
      await sleep(delay); attempts++;
    }
  }

  removeTyping();
  const msg = lastError?.message || 'Something went wrong.';
  const { content } = addMessage('assistant', msg, { error: true });
  if (isRetryable(lastError)) attachRetryButton(content, text);
  else showToast(msg);
  busy = false; sendBtn.disabled = false; input.disabled = false; input.focus(); scrollChat(true);
}

/* ---------- form + suggestions ---------- */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value;
  if (!text.trim()) return;
  input.value = ''; sendMessage(text);
});
$$('.chip[data-prompt]').forEach((chip) => {
  chip.addEventListener('click', () => {
    const prompt = chip.dataset.prompt;
    if (chip.closest('.panel[data-panel="compare"]')) $('#compareInput').value = prompt;
    else { input.value = prompt; input.focus(); }
  });
});
$('#newChatBtn').addEventListener('click', () => {
  if (busy) return showToast('Wait for the current reply to finish.');
  createConversation();
});

/* ---------- COMPARE ---------- */
$('#compareBtn').addEventListener('click', async () => {
  const v = $('#compareInput').value.trim();
  if (!v) return showToast('Type or choose a prompt first.');
  const wrap = $('#compareResults');
  wrap.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Comparing live models...</div>';
  showToast('Running comparison...');
  try {
    const r = await fetch('/api/compare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: v })
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    wrap.replaceChildren();
    data.results.forEach((res, i) => {
      const card = document.createElement('div');
      card.className = 'style-card';
      card.innerHTML = `
        <div class="style-card-head">
          <div><div class="style-card-label">${res.label}</div><div class="style-card-name">${res.name}</div></div>
          <span class="badge ${res.badge === 'Optimal' ? 'best' : ''}">${res.badge}</span>
        </div>
        <div class="style-score"><strong>${res.score}</strong><span>illustrative score / 100</span></div>
        <div class="style-bar"><div class="style-bar-fill" style="width:${res.score}%"></div></div>
        <div class="style-body">${escapeHtml(res.body)}</div>
        <div class="style-foot">${res.notes.map((n) => `<div class="style-foot-item"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg><span>${escapeHtml(n)}</span></div>`).join('')}</div>
      `;
      wrap.appendChild(card);
    });
    showToast('Comparison complete.');
  } catch (e) {
    wrap.innerHTML = `<div class="banner banner-amber"><span class="banner-icon">!</span><span>Error: ${e.message}</span></div>`;
    showToast('Comparison failed.');
  }
});

/* ---------- STUDIO ---------- */
$$('.file-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const file = btn.dataset.file;
    $$('.file-item').forEach((b) => b.classList.toggle('active', b === btn));
    $('#editorFile').textContent = file;
    
    // Replaced SAMPLE_FILES with inline strings for simplicity in this snippet
    const files = {
      'main.py': `# ChatFlow Python Workspace\ndef fibonacci(n):\n    a, b = 0, 1\n    result = []\n    for _ in range(n):\n        result.append(a)\n        a, b = b, a + b\n    return result\n\nprint(fibonacci(10))`,
      'index.html': `<!doctype html>\n<html>\n  <head><title>Demo</title></head>\n  <body>\n    <h1>Hello from ChatFlow Studio</h1>\n  </body>\n</html>`,
      'styles.css': `body {\n  font-family: system-ui, sans-serif;\n  background: #fafafa;\n  color: #18181b;\n}`
    };
    
    $('#editorCode').textContent = files[file] || '';
    $('#outputBody').innerHTML = `<div class="banner banner-neutral"><span class="banner-icon">i</span><span><strong>READY</strong><br/>Select "Run Code".</span></div>`;
  });
});
$('#runBtn').addEventListener('click', async () => {
  const file = $('#editorFile').textContent;
  const code = $('#editorCode').textContent;
  $('#outputBody').innerHTML = `<div class="banner banner-neutral"><span class="banner-icon">i</span><span>Executing...</span></div>`;
  try {
    const r = await fetch('/api/run-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, language: file.split('.').pop() })
    });
    const data = await r.json();
    $('#outputBody').innerHTML = `
      <div class="banner banner-neutral" style="background:#f0fdf4;border-color:#bbf7d0;color:#166534">
        <span class="banner-icon" style="background:#22c55e;color:#fff">✓</span>
        <span><strong>LIVE OUTPUT · ${file}</strong><br/>
        <pre style="margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:12px;white-space:pre-wrap;">${escapeHtml(data.output)}</pre>
        </span>
      </div>`;
  } catch (e) {
    $('#outputBody').innerHTML = `<div class="banner banner-amber"><span class="banner-icon">!</span><span>Execution Error: ${e.message}</span></div>`;
  }
});

/* ---------- settings ---------- */
const prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
if (prefs.model) $('#settingsModel').value = prefs.model;
if (prefs.compact) { $('#compactMode').checked = true; document.body.classList.add('compact'); }
$('#confirmPrefs').addEventListener('click', () => {
  const model = $('#settingsModel').value;
  const compact = $('#compactMode').checked;
  localStorage.setItem(PREF_KEY, JSON.stringify({ model, compact }));
  document.body.classList.toggle('compact', compact);
  showToast('Preferences saved.');
});

/* ---------- boot ---------- */
try {
  const saved = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || 'null');
  if (Array.isArray(saved)) conversations = saved.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages));
} catch { conversations = []; }

if (!conversations.length) {
  const oldMessages = loadHistory();
  conversations = [{
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: oldMessages.find((m) => m.role === 'user')?.text?.trim().slice(0, 34) || 'New conversation',
    messages: oldMessages, createdAt: Date.now(), updatedAt: Date.now()
  }];
}
const lastActiveId = (() => { try { return localStorage.getItem('chatflow-active-conversation-v1'); } catch { return null; } })();
activeConversationId = conversations.some((c) => c.id === lastActiveId) ? lastActiveId : conversations[0].id;
history = (conversations.find((c) => c.id === activeConversationId)?.messages || []).slice();
renderConversation();
renderRecentChats();
input.focus();
