const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* ---------- state ---------- */
let history = [];
let busy = false;
let toastTimer;
const STORAGE_KEY = 'chatflow-history-v2';
const PREF_KEY = 'chatflow-prefs-v2';
const CLIENT_MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/* ---------- sample data ---------- */
const SAMPLE_RESULTS = [
  { label: 'STYLE 1', name: 'Flow Reason', badge: 'Optimal', score: 98, body: 'External entity: a rectangle representing a source or destination outside the system.\nProcess: a circle or rounded rectangle that transforms input data into output.\nData flow: an arrow showing the movement of data.', notes: ['Defines the main symbols and their roles accurately.', 'Response time: 0.9s (demo)'] },
  { label: 'STYLE 2', name: 'Flow Fast', badge: 'Average', score: 86, body: 'Entities are outside the system boundary. Processes work on data inside the system. Arrows show how data moves between them.', notes: ['Correct summary with fewer notation details.', 'Response time: 0.3s (demo)'] },
  { label: 'STYLE 3', name: 'Flow Lite', badge: 'Average', score: 75, body: 'A DFD uses symbols and arrows to explain how data enters, moves through, and leaves a system.', notes: ['Good overview but omits symbol definitions.', 'Response time: 0.2s (demo)'] }
];

const SAMPLE_FILES = {
  'main.py': `# ChatFlow Python Workspace\ndef fibonacci(n):\n    a, b = 0, 1\n    result = []\n    for _ in range(n):\n        result.append(a)\n        a, b = b, a + b\n    return result\n\nprint(fibonacci(10))`,
  'index.html': `<!doctype html>\n<html>\n  <head><title>Demo</title></head>\n  <body>\n    <h1>Hello from ChatFlow Studio</h1>\n  </body>\n</html>`,
  'styles.css': `body {\n  font-family: system-ui, sans-serif;\n  background: #fafafa;\n  color: #18181b;\n}`
};

const SAMPLE_RUN = {
  'main.py': '[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]',
  'index.html': 'Rendered preview is not available in this demo.',
  'styles.css': 'Styles are applied live in the Studio panel preview.'
};

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

menuBtn.addEventListener('click', () => {
  document.body.classList.toggle('sidebar-open');
});
overlay.addEventListener('click', () => {
  document.body.classList.remove('sidebar-open');
});

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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40))); } catch {}
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
  
  // If it's a normal message, render markdown
  if (role === 'assistant' && !opts.error && text.trim() !== '') {
    c.innerHTML = DOMPurify.sanitize(marked.parse(text));
  } else {
    c.textContent = text;
  }
  
  if (opts.error) c.classList.add('error');
  
  row.append(av, c);
  messagesEl.append(row);
  return { row, content: c };
}

function showTyping() {
  const row = document.createElement('div');
  row.className = 'message assistant';
  row.id = 'typingIndicator';
  const av = document.createElement('div');
  av.className = 'message-avatar';
  av.textContent = 'CF';
  const dots = document.createElement('div');
  dots.className = 'typing';
  dots.innerHTML = '<span></span><span></span><span></span>';
  row.append(av, dots);
  messagesEl.append(row);
}

function removeTyping() { $('#typingIndicator')?.remove(); }

function renderHistory() {
  if (!history.length) return;
  chatEmpty.hidden = true;
  for (const item of history) {
    addMessage(item.role === 'user' ? 'user' : 'assistant', item.text);
  }
  scrollChat();
}

function scrollChat(force = false) {
  const scroller = $('#chatScroll');
  if (!scroller) return;
  
  // Only scroll if forced (like sending a new message) or if we are already near the bottom
  const isNearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 150;
  if (force || isNearBottom) {
    scroller.scrollTop = scroller.scrollHeight;
  }
}

/* ---------- chat networking ---------- */
async function postChat(payload) {
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `Request failed (${r.status})`);
    err.status = r.status;
    throw err;
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
  btn.className = 'retry-btn';
  btn.type = 'button';
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg> <span>Retry</span>';
  
  btn.addEventListener('click', () => {
    if (busy) return;
    const row = content.closest('.message');
    const idx = history.map((h) => h.role + ':' + h.text).lastIndexOf('user:' + userText);
    if (idx >= 0) {
      history = history.slice(0, idx);
      saveHistory();
    }
    row?.remove();
    sendMessage(userText, { retry: true });
  });
  content.appendChild(document.createElement('br'));
  content.appendChild(btn);
}

/* ---------- Typewriter Effect ---------- */
async function typeWriter(element, text) {
  // 1. Configure marked to use plain text lists (so we can type the numbers/bullets)
  marked.use({
    renderer: {
      listitem(text) { return text + '\n'; },
      list(body, ordered, start) { return body; }
    }
  });

  // 2. Get the text with plain bullets/numbers
  let plainText = marked.parse(text);
  
  // 3. Clean up the text by removing HTML tags (like <p>, <strong>)
  // but keep the newlines and the numbers/bullets.
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = plainText;
  
  // Extract the raw text (this will include our typed bullets and numbers)
  const rawText = tempDiv.textContent || tempDiv.innerText || "";
  
  // Reset the element
  element.innerHTML = '';
  
  // 4. Type it out character by character
  const chunkSize = 2; // Type 2 characters at a time
  
  for (let i = 0; i < rawText.length; i += chunkSize) {
    // We use textContent so it doesn't break if we type half of an HTML tag
    element.textContent = rawText.substring(0, i + chunkSize);
    
    // Auto-scroll as it types
    scrollChat(false);
    
    // Typing speed (15ms is smooth)
    await sleep(15); 
  }
  
  // 5. Once typing is finished, apply the real Markdown formatting
  element.innerHTML = DOMPurify.sanitize(marked.parse(text));
  
  // Restore the normal marked configuration for future messages
  marked.use({
    renderer: {
      listitem(text) { 
        return '<li>' + text + '</li>\n'; 
      },
      list(body, ordered, start) {
        return ordered ? '<ol start="' + start + '">\n' + body + '</ol>\n' : '<ul>\n' + body + '</ul>\n';
      }
    }
  });
}
/* ---------- Action Buttons ---------- */
function addActionButtons(content, text) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';

  // 1. Copy
  const copyBtn = document.createElement('button');
  copyBtn.className = 'action-btn';
  copyBtn.title = 'Copy';
  copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  };

  // 2. Retry
  const retryBtn = document.createElement('button');
  retryBtn.className = 'action-btn';
  retryBtn.title = 'Retry';
  retryBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';
  retryBtn.onclick = () => {
    if (busy) return;
    const idx = history.map((h) => h.role + ':' + h.text).lastIndexOf('model:' + text);
    if (idx > 0) {
      const userText = history[idx - 1].text;
      history = history.slice(0, idx - 1); 
      saveHistory();
      content.closest('.message').remove(); 
      sendMessage(userText, { retry: true });
    }
  };

  // 3. Like
  const likeBtn = document.createElement('button');
  likeBtn.className = 'action-btn';
  likeBtn.title = 'Good response';
  likeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>';
  likeBtn.onclick = () => {
    likeBtn.classList.toggle('active-like');
    dislikeBtn.classList.remove('active-dislike');
  };

  // 4. Dislike
  const dislikeBtn = document.createElement('button');
  dislikeBtn.className = 'action-btn';
  dislikeBtn.title = 'Bad response';
  dislikeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2"/></svg>';
  dislikeBtn.onclick = () => {
    dislikeBtn.classList.toggle('active-dislike');
    likeBtn.classList.remove('active-like');
  };

  // 5. Share
  const shareBtn = document.createElement('button');
  shareBtn.className = 'action-btn';
  shareBtn.title = 'Share';
  shareBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
  shareBtn.onclick = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'ChatFlow AI', text: text }); } catch (err) {}
    } else {
      navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!');
    }
  };

  actions.append(copyBtn, retryBtn, likeBtn, dislikeBtn, shareBtn);
  content.appendChild(actions);
}

/* ---------- send with retry ---------- */
async function sendMessage(text, options = {}) {
  text = String(text || '').trim();
  if (!text || busy) return;

  busy = true;
  sendBtn.disabled = true;
  input.disabled = true;
  chatEmpty.hidden = true;

  history.push({ role: 'user', text });
  saveHistory();
  addMessage('user', text);

  showTyping();
  scrollChat(true); // Force scroll to show the user message and typing indicator

  let lastError = null;
  let attempts = 1;

  while (attempts <= CLIENT_MAX_ATTEMPTS) {
    try {
      const data = await postChat({ messages: history });
      removeTyping();
      const answer = String(data.answer || '').trim() || 'No response.';
      history.push({ role: 'model', text: answer });
      saveHistory();
      
      // Create the empty bubble
      const { content } = addMessage('assistant', ''); 
      
      // Scroll down so the user sees the empty bubble ready to type
      scrollChat(true); 
      
      // Wait for the UI to settle before typing
      await sleep(100); 
      
      // Type out the response
      await typeWriter(content, answer);
      
      // Add the action buttons (copy, share, etc.)
      addActionButtons(content, answer);
      
      busy = false;
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
      return;
    } catch (e) {
      lastError = e;
      const canRetry = isRetryable(e) && attempts < CLIENT_MAX_ATTEMPTS;
      if (!canRetry) break;

      const delay = 1000 * Math.pow(2, attempts - 1);
      showToast(`Retrying in ${delay / 1000}s… (attempt ${attempts + 1} of ${CLIENT_MAX_ATTEMPTS})`);
      await sleep(delay);
      attempts++;
    }
  }

  removeTyping();
  const msg = lastError?.message || 'Something went wrong.';
  const { content } = addMessage('assistant', msg, { error: true });

  if (isRetryable(lastError)) {
    attachRetryButton(content, text);
  } else {
    showToast(msg);
  }

  busy = false;
  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
  scrollChat(true);
}

/* ---------- form + suggestions ---------- */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value;
  if (!text.trim()) return;
  input.value = '';
  sendMessage(text);
});

$$('.chip[data-prompt]').forEach((chip) => {
  chip.addEventListener('click', () => {
    const prompt = chip.dataset.prompt;
    if (chip.closest('.panel[data-panel="compare"]')) {
      $('#compareInput').value = prompt;
    } else {
      input.value = prompt;
      input.focus();
    }
  });
});

/* ---------- new chat ---------- */
$('#newChatBtn').addEventListener('click', () => {
  history = [];
  saveHistory();
  messagesEl.replaceChildren();
  chatEmpty.hidden = false;
  input.value = '';
  input.focus();
  document.body.classList.remove('sidebar-open');
});

/* ---------- recent items ---------- */
$$('.recent-item').forEach((item) => {
  item.addEventListener('click', () => {
    $$('.recent-item').forEach((r) => r.classList.toggle('active', r === item));
    showToast('Demo: recent conversations are not stored in this build.');
  });
});

/* ---------- compare ---------- */
function renderCompare(prompt) {
  const wrap = $('#compareResults');
  wrap.replaceChildren();
  SAMPLE_RESULTS.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'style-card';
    card.innerHTML = `
      <div class="style-card-head">
        <div><div class="style-card-label">${r.label}</div><div class="style-card-name">${r.name}</div></div>
        <span class="badge ${r.badge === 'Optimal' ? 'best' : ''}">${r.badge}</span>
      </div>
      <div class="style-score"><strong>${r.score}</strong><span>illustrative score / 100</span></div>
      <div class="style-bar"><div class="style-bar-fill" style="width:${r.score}%"></div></div>
      <div class="style-body">${escapeHtml(r.body)}</div>
      <div class="style-foot">${r.notes.map((n) => `<div class="style-foot-item"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg><span>${escapeHtml(n)}</span></div>`).join('')}</div>
    `;
    wrap.appendChild(card);
  });
  showToast(`Compared sample replies for: "${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}"`);
}
$('#compareBtn').addEventListener('click', () => {
  const v = $('#compareInput').value.trim();
  if (!v) return showToast('Type or choose a prompt first.');
  renderCompare(v);
});

/* ---------- studio ---------- */
$$('.file-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const file = btn.dataset.file;
    $$('.file-item').forEach((b) => b.classList.toggle('active', b === btn));
    $('#editorFile').textContent = file;
    $('#editorCode').textContent = SAMPLE_FILES[file] || '';
    $('#outputBody').innerHTML = `<div class="banner banner-neutral"><span class="banner-icon">i</span><span><strong>SIMULATED</strong><br/>Choose a file and select "Demo run".<br/>This example does not execute code.</span></div>`;
  });
});
$('#runBtn').addEventListener('click', () => {
  const file = $('#editorFile').textContent;
  const out = SAMPLE_RUN[file] || 'No simulated output for this file.';
  $('#outputBody').innerHTML = `<div class="banner banner-neutral"><span class="banner-icon">i</span><span><strong>SIMULATED OUTPUT · ${file}</strong><br/><code style="font-family:'JetBrains Mono',monospace">${escapeHtml(out)}</code></span></div>`;
  showToast('Demo run complete (simulated).');
});

/* ---------- settings ---------- */
const prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
if (prefs.model) $('#settingsModel').value = prefs.model;
if (prefs.compact) $('#compactMode').checked = true;
if (prefs.compact) document.body.classList.add('compact');

$('#confirmPrefs').addEventListener('click', () => {
  const model = $('#settingsModel').value;
  const compact = $('#compactMode').checked;
  localStorage.setItem(PREF_KEY, JSON.stringify({ model, compact }));
  document.body.classList.toggle('compact', compact);
  showToast('Preferences saved.');
});

/* ---------- boot ---------- */
history = loadHistory();
renderHistory();
input.focus();
