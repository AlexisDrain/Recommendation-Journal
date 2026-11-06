// Records an app preview: the app at 443 × 827 points (886 × 1654 pixels, between an iPhone's
// status bar and home bar, which are added when the video is made), with a dot showing each tap.
import fs from 'node:fs';
import { connect } from './cdp.mjs';
const name = process.argv[2];
const b = await connect();
await b.viewport(443, 960 - 59 - 34, 2);
const home = 'http://localhost:8081';
const dir = `frames/${name}`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

let recording = false;
const frames = [];
b.on((m) => {
  if (m.method !== 'Page.screencastFrame') return;
  b.send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
  if (!recording) return;
  const file = `${dir}/${String(frames.length).padStart(5, '0')}.jpg`;
  fs.writeFileSync(file, Buffer.from(m.params.data, 'base64'));
  frames.push({ file, t: m.params.metadata.timestamp });
});
const dot = (x, y) => b.ev(`(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:22px;background:rgba(255,255,255,.45);border:2px solid rgba(255,255,255,.8);pointer-events:none;z-index:99999;transition:transform .35s,opacity .35s'; document.body.appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = 'scale(1.5)'; d.style.opacity = '0'; })); setTimeout(() => d.remove(), 500); })()`);
// Scrolls in small steps until the thing to tap is on screen, as a person would (no jumping to it).
async function scrollTo(q) {
  let last = null, still = 0;
  for (let i = 0; i < 60; i++) {
    const r = await b.ev(`(() => { const e = __el(${JSON.stringify(q)}); if (!e) return null; const b = e.getBoundingClientRect(); let p = e.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement; const box = p ? p.getBoundingClientRect() : { top: 0, bottom: innerHeight }; return { x: b.left + b.width / 2, top: b.top - box.top, bottom: box.bottom - b.bottom, h: innerHeight }; })()`);
    if (!r) return;
    // top / bottom: room between the button and the edges of the part that scrolls
    const dy = r.bottom < 16 ? 1 : r.top < 16 ? -1 : 0;
    still = r.top === last ? still + 1 : 0;
    if (!dy || still >= 4) return; // there, or it can't scroll any further
    last = r.top;
    await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.x, y: r.h * 0.6, deltaX: 0, deltaY: dy * 24 });
    await pause(16);
  }
}
async function tap(q, after = 700) {
  await scrollTo(q);
  await pause(250);
  const p = await b.center(q);
  await dot(p.x, p.y);
  await pause(150);
  for (const type of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await pause(after);
}
async function type(text, perChar) {
  for (const ch of text) { await b.send('Input.insertText', { text: ch }); await pause(perChar); }
}
const pause = (ms) => b.sleep(ms);
// Keeps the page drawing steadily, so the recording has frames even when nothing moves.
const ticker = `(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:99999'; document.body.appendChild(d); let i = 0; setInterval(() => { d.style.background = (i++ % 2) ? '#000' : '#010101'; }, 33); })()`;

const scripts = {
  // 1. Adding one, from the search box
  async add() {
    await b.goto(`${home}/`, 3500);
    while (await b.ev(`document.body.innerText.includes('Dan Erickson')`)) { // from an earlier take
      await b.tap('~Dan Erickson', 1200);
      await b.tap('Delete', 1500);
      await b.goto(`${home}/`, 3000);
    }
    await b.ev(ticker);
    await start();
    await pause(1500);
    await tap('Search, or type something new to add…', 500);
    await type('Severance', 120);
    await pause(900);
    await tap('~Add “Severance”', 1300);
    await tap('Author (or director, artist…), like Stephen King', 400);
    await type('Dan Erickson', 70);
    await pause(400);
    await tap('TV shows', 800);
    await tap('Who? (my brother, a stranger in the park…)', 400);
    await type('my best friend', 80);
    await pause(400);
    await tap('Why? What did they say about it?', 400);
    await type('The best show in years. Watch it before the internet spoils it.', 45);
    await pause(900);
    await scrollTo('Add');
    await pause(1200); // a moment to see the whole form filled in
    await tap('Add', 1800);
    await pause(1300);
  },
  // 2. Done: mark it read, rate it, and see the Priority list close up
  async rate() {
    await b.goto(`${home}/`, 3500);
    await b.ev(ticker);
    await start();
    await pause(1500);
    await tap('~Category', 1100);
    await tap('~Priority', 1800);
    await pause(1200);
    await tap('~Project Hail Mary', 1500);
    await b.ev(`(() => { const s = [...document.querySelectorAll('div')].find((d) => d.innerText?.startsWith('4. ') && d.children.length === 0); s?.scrollIntoView({ behavior: 'smooth', block: 'start' }); })()`);
    await pause(1500);
    await tap('Read', 1000);
    await tap('~Exceptional', 1300);
    await tap('Save', 2000);
    await pause(1200);
    await tap('~Category', 1100);
    await tap('~Fiction books', 2500);
    await pause(1500);
  },
  // 3. The Sheet and the categories
  async sheet() {
    await b.goto(`${home}/`, 3500);
    await b.ev(ticker);
    await start();
    await pause(1200);
    await tap('~Sheet', 1500);
    for (let i = 0; i < 12; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 300, y: 500, deltaX: 70, deltaY: 0 }); await pause(90); }
    await pause(1500);
    for (let i = 0; i < 12; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 300, y: 500, deltaX: -70, deltaY: 0 }); await pause(60); }
    await pause(800);
    await tap('~Categories', 2500);
    await tap('~Settings', 1500);
    await pause(600);
    for (let i = 0; i < 16; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 220, y: 500, deltaX: 0, deltaY: 30 }); await pause(45); }
    await pause(3500);
  },
};

async function start() {
  await b.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  await b.sleep(300);
  recording = true;
}
await scripts[name]();
recording = false;
await b.send('Page.stopScreencast');
// ffconcat list: each frame lasts until the next one arrived
const lines = ['ffconcat version 1.0'];
frames.forEach((f, i) => {
  const next = frames[i + 1]?.t ?? f.t + 0.5;
  lines.push(`file '${f.file.split('/').pop()}'`, `duration ${(next - f.t).toFixed(4)}`);
});
lines.push(`file '${frames.at(-1).file.split('/').pop()}'`);
fs.writeFileSync(`${dir}/list.txt`, lines.join(String.fromCharCode(10)));
console.log(name, frames.length, 'frames', (frames.at(-1).t - frames[0].t).toFixed(1), 's');
b.close();
