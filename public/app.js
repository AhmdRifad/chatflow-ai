const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* state */
let history = [];
let busy = false;
let toastTimer;
const STORAGE_KEY = 'chatflow-history-v2';
const PREF_KEY = 'chatflow-prefs-v2';

/* sample data */
const SAMPLE_RESULTS = [
  {
    label: 'STYLE 1',
    name: 'Flow Reason',
    badge: 'Optimal',
    score: 98,
    body: 'External entity: a rectangle representing a source or destination outside the system.\nProcess: a circle or rounded rectangle that transforms input data into output.\nData flow: an arrow showing the movement of data.',
    notes: [
      'Defines the main symbols and their roles accurately.',
      'Response time: 0.9s (demo)'
    ]
  },
  {
    label: 'STYLE 2',
    name: 'Flow Fast',
    badge: 'Average',
    score: 86,
    body: 'Entities are outside the system boundary. Processes work on data inside the system. Arrows show how data moves between them.',
    notes: [
      'Correct summary with fewer notation details.',
      'Response time: 0.3s (demo)'
    ]
  },
  {
    label: 'STYLE 3',
    name: 'Flow Lite',
    badge: 'Average',
    score: 75,
    body: 'A DFD uses symbols and arrows to explain how data enters, moves through, and leaves a system.',
    notes: [
      'Good overview but omits symbol definitions.',
      'Response time: 0.2s (demo)'
    ]
  }
];

const SAMPLE_FILES = {
  'main.py': `# ChatFlow Python Workspace
def fibonacci(n):
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

print(fibonacci(10))`,
  'index.html': `<!doctype html>
<html>
  <head><title>Demo</title></head>
  <body>
    <h1>Hello from ChatFlow Studio</h1>
  </body>
</html>`,
  'styles.css': `body {
  font-family: system-ui, sans-serif;
  background: #fafafa;
  color: #18181b;
}`
};

const SAMPLE_RUN = {
  'main.py': '[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]',
  'index.html': 'Rendered preview is not available in this demo.',
  'styles.css': 'Styles are applied live in the Studio panel preview.'
};

/* tabs */
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

/* toast */
const toast = document.createElement('div');
toast.className = 'toast';
document.body.appendChild(toast);
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

/* escape html */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* chat */
const form = $('#chatForm');
const input = $('#promptInput');
const messagesEl = $('#messages');
const chatEmpty = $('#chatEmpty');
const sendBtn = $('#sendBtn');

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveHistory() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40))); } catch {}
}
function addMessage(role, text, opts = {}) {
  const row = document.createElement('div');
  row.className = `message ${role}`;
  const av = document.createElement('div');
  av.className = 'message-avatar';
  av.textContent = role === 'user' ? 'You' : 'CF';
  const c = document.createElement('div');
  c.className = 'message-content';
  c.textContent = text;
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
function scrollChat() {
  const scroller = $('#chatScroll');
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
}

async function sendMessage(text) {
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
  scrollChat();

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    });
    const data = await r.json().catch(() => ({}));
    removeTyping();
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    const answer = String(data.answer || '').trim() || 'No response.';
    history.push({ role: 'model', text: answer });
    saveHistory();
    addMessage('assistant', answer);
  } catch (e) {
    removeTyping();
    const msg = e.message || 'Something went wrong.';
    addMessage('assistant', msg, { error: true });
    showToast(msg);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
    scrollChat();
  }
}

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

/* new chat */
$('#newChatBtn').addEventListener('click', () => {
  history = [];
  saveHistory();
  messagesEl.replaceChildren();
  chatEmpty.hidden = false;
  input.value = '';
  input.focus();
});

/* recent items */
$$('.recent-item').forEach((item) => {
  item.addEventListener('click', () => {
    $$('.recent-item').forEach((r) => r.classList.toggle('active', r === item));
    showToast('Demo: recent conversations are not stored in this build.');
  });
});

/* compare */
function renderCompare(prompt) {
  const wrap = $('#compareResults');
  wrap.replaceChildren();
  SAMPLE_RESULTS.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'style-card';
    card.innerHTML = `
      <div class="style-card-head">
        <div>
          <div class="style-card-label">${r.label}</div>
          <div class="style-card-name">${r.name}</div>
        </div>
        <span class="badge ${r.badge === 'Optimal' ? 'best' : ''}">${r.badge}</span>
      </div>
      <div class="style-score"><strong>${r.score}</strong><span>illustrative score / 100</span></div>
      <div class="style-bar"><div class="style-bar-fill" style="width:${r.score}%"></div></div>
      <div class="style-body">${escapeHtml(r.body)}</div>
      <div class="style-foot">
        ${r.notes.map((n) => `
          <div class="style-foot-item">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>${escapeHtml(n)}</span>
          </div>`).join('')}
      </div>
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

/* studio */
$$('.file-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const file = btn.dataset.file;
    $$('.file-item').forEach((b) => b.classList.toggle('active', b === btn));
    $('#editorFile').textContent = file;
    $('#editorCode').textContent = SAMPLE_FILES[file] || '';
    $('#outputBody').innerHTML = `
      <div class="banner banner-neutral">
        <span class="banner-icon">i</span>
        <span><strong>SIMULATED</strong><br/>Choose a file and select "Demo run".<br/>This example does not execute code.</span>
      </div>`;
  });
});
$('#runBtn').addEventListener('click', () => {
  const file = $('#editorFile').textContent;
  const out = SAMPLE_RUN[file] || 'No simulated output for this file.';
  $('#outputBody').innerHTML = `
    <div class="banner banner-neutral">
      <span class="banner-icon">i</span>
      <span><strong>SIMULATED OUTPUT · ${file}</strong><br/><code style="font-family:'JetBrains Mono',monospace">${escapeHtml(out)}</code></span>
    </div>`;
  showToast('Demo run complete (simulated).');
});

/* settings */
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

/* boot */
history = loadHistory();
renderHistory();
input.focus();
