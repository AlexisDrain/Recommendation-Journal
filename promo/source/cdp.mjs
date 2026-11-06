// A tiny Chrome DevTools Protocol driver for headless Edge.
import fs from 'node:fs';
export async function connect(port = 9333) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const waiting = new Map();
  const handlers = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      const { resolve, reject } = waiting.get(m.id);
      waiting.delete(m.id);
      m.error ? reject(new Error(`${m.error.message}`)) : resolve(m.result);
    } else if (m.method) handlers.forEach((h) => !h.dead && h(m));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const on = (fn) => handlers.push(fn);
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  // A phone shows no scroll bars until you scroll: hide the desktop ones.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '* { scrollbar-width: none !important; } ::-webkit-scrollbar { display: none !important; }'; document.head.append(s); });` });
  on((m) => { if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }); });

  const helper = `
    window.__el = (q) => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const all = [...document.querySelectorAll('[aria-label],[role=button],[role=tab],a,button,input,textarea,div,span')].filter(vis);
      if (q.startsWith('~')) { const w = q.slice(1); const m = all.filter((e) => (e.innerText ?? '').includes(w)); m.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height); return m[0] ? (m[0].closest('[role=button],[role=tab],a,button,[tabindex]') ?? m[0]) : null; }
      const exact = all.filter((e) => e.getAttribute('aria-label') === q || e.placeholder === q || e.innerText?.trim() === q);
      const pick = exact.length ? exact : all.filter((e) => (e.getAttribute('aria-label') ?? '').includes(q) || (e.innerText ?? '').trim().startsWith(q));
      pick.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
      const clickable = pick.map((e) => e.closest('[role=button],[role=tab],a,button,input,textarea,[tabindex]') ?? e);
      return clickable[clickable.length && exact.length ? 0 : 0] ?? null;
    };`;
  const api = {
    send, on, ev, sleep,
    async viewport(width, height, deviceScaleFactor, mobile = true) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    },
    async goto(url, wait = 3000) {
      await send('Page.navigate', { url });
      await sleep(wait);
      await ev(helper);
    },
    helper: () => ev(helper),
    async center(q) {
      await ev(helper);
      const r = await ev(`(() => { const e = __el(${JSON.stringify(q)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
      if (!r) throw new Error(`Not found: ${q}`);
      return r;
    },
    async tap(q, after = 600) {
      const { x, y } = typeof q === 'string' ? await api.center(q) : q;
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      await sleep(after);
    },
    async type(text, perChar = 70) {
      for (const ch of text) { await send('Input.insertText', { text: ch }); await sleep(perChar); }
    },
    async key(key, code = key, keyCode = 13) {
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, text: type === 'keyDown' && key === 'Enter' ? '\r' : undefined });
    },
    async shot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path, Buffer.from(data, 'base64'));
    },
    close: () => ws.close(),
  };
  await ev(helper);
  return api;
}
