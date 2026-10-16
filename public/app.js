const $ = (selector) => document.querySelector(selector);
const form = $('#chatForm');
const input = $('#promptInput');
const messagesEl = $('#messages');
const welcome = $('#welcome');
const sendBtn = $('#sendBtn');
const toast = $('#toast');
let history = [];
let busy = false;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
function scrollBottom() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
function addMessage(role, text, options = {}) {
  const row = document.createElement('div');
  row.className = `message ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'You' : '✦';
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;
  if (options.error) content.classList.add('message-error');
  row.append(avatar, content);
  messagesEl.append(row);
  return { row, content };
}
function showTyping() {
  const row = document.createElement('div');
  row.className = 'message assistant';
  row.id = 'typingIndicator';
  const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.textContent = '✦';
  const dots = document.createElement('div'); dots.className = 'typing'; dots.innerHTML = '<span></span><span></span><span></span>';
  row.append(avatar, dots); messagesEl.append(row); scrollBottom();
}
function removeTyping() { $('#typingIndicator')?.remove(); }
function revealConversation() { welcome.hidden = true; }
function resetChat() { history = []; messagesEl.replaceChildren(); welcome.hidden = false; input.value = ''; input.focus(); }
async function sendMessage(text) {
  text = String(text || '').trim();
  if (!text || busy) return;
  busy = true; sendBtn.disabled = true; input.disabled = true;
  revealConversation();
  history.push({ role: 'user', text });
  addMessage('user', text); showTyping(); scrollBottom();
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    });
    const data = await response.json().catch(() => ({}));
    removeTyping();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    const answer = String(data.answer || '').trim() || 'I could not generate a response. Please try again.';
    history.push({ role: 'model', text: answer });
    addMessage('assistant', answer);
  } catch (error) {
    removeTyping();
    const errorText = error.message || 'Something went wrong. Please try again.';
    addMessage('assistant', errorText, { error: true });
    showToast(errorText);
  } finally {
    busy = false; sendBtn.disabled = false; input.disabled = false; input.focus(); scrollBottom();
  }
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value;
  if (!text.trim()) return;
  input.value = ''; input.style.height = 'auto';
  sendMessage(text);
});
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; });
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
$('#newChatBtn').addEventListener('click', resetChat);
$('#homeBtn').addEventListener('click', () => { resetChat(); $('#sidebar').classList.remove('open'); });
$('#historyBtn').addEventListener('click', () => showToast(history.length ? `This chat has ${Math.ceil(history.length / 2)} message(s). Start a new chat to reset it.` : 'No messages in this chat yet.'));
$('#clearBtn').addEventListener('click', () => { resetChat(); showToast('Current chat cleared.'); });
$('#themeBtn').addEventListener('click', () => { document.body.classList.toggle('light'); localStorage.setItem('chatflow-theme', document.body.classList.contains('light') ? 'light' : 'dark'); });
$('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.prompt || ''; input.focus(); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; }));
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); resetChat(); } if (event.key === 'Escape') $('#sidebar').classList.remove('open'); });
if (localStorage.getItem('chatflow-theme') === 'light') document.body.classList.add('light');
(async function checkServer() {
  const dot = $('#statusDot'), title = $('#statusTitle'), sub = $('#statusText');
  try {
    const response = await fetch('/api/health'); const data = await response.json();
    if (data.configured) { dot.classList.add('online'); title.textContent = 'AI ready'; sub.textContent = 'Gemini connection configured'; }
    else { title.textContent = 'Setup required'; sub.textContent = 'Add your Gemini API key'; }
  } catch { title.textContent = 'Server unavailable'; sub.textContent = 'Start the backend server'; }
})();
