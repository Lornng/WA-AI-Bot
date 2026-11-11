/** Minimal single-file chat page for the /dev endpoint. */
export const DEV_CHAT_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WA Bot — dev chat</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; background: #f4f5f7; }
  @media (prefers-color-scheme: dark) { body { background: #111418; color: #e6e6e6; } .msg.bot { background: #23272e; } .bar { background: #191d23; } }
  .bar { padding: 10px 14px; background: #fff; border-bottom: 1px solid #ddd; font-size: 14px; }
  @media (prefers-color-scheme: dark) { .bar { background: #191d23; border-color: #2a2f37; } }
  #log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .msg { max-width: 75%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; word-wrap: break-word; font-size: 15px; }
  .msg.me { align-self: flex-end; background: #d9fdd3; }
  .msg.bot { align-self: flex-start; background: #fff; border: 1px solid #e2e2e2; }
  .msg.err { align-self: center; color: #b3261e; font-size: 13px; }
  @media (prefers-color-scheme: dark) { .msg.me { background: #005c4b; } }
  .input { display: flex; gap: 8px; padding: 10px; background: #fff; border-top: 1px solid #ddd; }
  @media (prefers-color-scheme: dark) { .input { background: #191d23; border-color: #2a2f37; } }
  textarea { flex: 1; resize: none; height: 44px; padding: 10px; border: 1px solid #ccc; border-radius: 8px; font: inherit; background: transparent; }
  button { padding: 0 18px; border: 0; border-radius: 8px; background: #00a884; color: #fff; font: inherit; cursor: pointer; }
</style>
</head>
<body>
<div class="bar"><b>WA Bot dev chat</b> — same pipeline as WhatsApp (DM mode). Try: <code>!help</code>, <code>!status</code>, <code>!reset</code>, or just say hi.</div>
<div id="log"></div>
<div class="input">
  <textarea id="q" placeholder="Message the bot…"></textarea>
  <button onclick="send()">Send</button>
</div>
<script>
  const log = document.getElementById('log');
  const q = document.getElementById('q');
  function add(text, cls) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }
  async function send() {
    const text = q.value.trim();
    if (!text) return;
    q.value = '';
    add(text, 'me');
    try {
      const r = await fetch('/dev/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      add(j.reply || '(no reply)', r.ok ? 'bot' : 'err');
    } catch (e) {
      add('Request failed: ' + e, 'err');
    }
  }
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  q.focus();
</script>
</body>
</html>`;
