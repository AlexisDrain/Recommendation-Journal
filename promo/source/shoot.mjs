// The App Store screenshots: the app between an iPhone's status bar (drawn later) and home bar.
import { connect } from './cdp.mjs';
const b = await connect();
const W = 393, H = 852 - 59 - 34; // the status bar (59 points) and home bar (34) are added afterwards
await b.viewport(W, H, 3);
const home = 'http://localhost:8081';
const padTabs = () => b.ev(`(() => { const t = document.querySelector('[role=tab]'); if (!t) return; let bar = t; while (bar.parentElement && bar.getBoundingClientRect().width < innerWidth - 2) bar = bar.parentElement; if (bar.dataset.padded) return; bar.dataset.padded = 1; bar.style.height = (bar.getBoundingClientRect().height + 34) + 'px'; bar.style.paddingBottom = '34px'; })()`);
const shot = async (name) => { await b.sleep(500); await b.shot(`raw/${name}.png`); console.log('shot', name); };
const only = process.argv[2];
const scenes = {
  async '01-list'() { await b.goto(`${home}/`, 3500); },
  async '02-search-add'() {
    await b.goto(`${home}/`, 3500);
    await b.tap('Search, or type something new to add…', 400);
    await b.type('Severance', 60);
    await b.sleep(800);
  },
  async '03-edit'() {
    await b.goto(`${home}/`, 3500);
    await b.tap('~Project Hail Mary', 1500);
  },
  async '04-rate'() {
    await b.goto(`${home}/`, 3500);
    await b.tap('~The Count of Monte Cristo', 1500);
    await b.ev(`(() => { const s = [...document.querySelectorAll('div')].find((d) => d.innerText?.startsWith('4. ') && d.children.length === 0); s?.scrollIntoView({ block: 'start' }); })()`);
    await b.sleep(600);
  },
  async '05-priority'() {
    await b.goto(`${home}/`, 3500);
    await b.tap('~Category', 1000);
    await b.tap('~Priority', 1200);
  },
  async '06-movies'() {
    await b.goto(`${home}/`, 3500);
    await b.tap('~Category', 1000);
    await b.tap('~Movies', 1200);
  },
  async 'x-fiction'() { // for the header art only
    await b.goto(`${home}/`, 3500);
    await b.tap('~Category', 1000);
    await b.tap('~Fiction books', 1200);
  },
  async '07-sheet'() { await b.goto(`${home}/sheet`, 3500); },
  async '08-categories'() { await b.goto(`${home}/categories`, 3500); },
  async '09-sync'() {
    await b.goto(`${home}/settings`, 3500);
    await b.ev(`(() => { const s = [...document.querySelectorAll('div')].find((d) => /^google sheet$/i.test(d.innerText?.trim() ?? '') && d.children.length === 0); if (!s) return; s.scrollIntoView({ block: 'start' }); let p = s.parentElement; while (p && p.scrollHeight <= p.clientHeight) p = p.parentElement; if (p) p.scrollTop -= 36; })()`);
    await b.sleep(600);
  },
  async '10-light'() {
    await b.goto(`${home}/settings`, 3500);
    await b.tap('Light', 1200);
    await b.goto(`${home}/`, 3500);
  },
};
for (const [name, run] of Object.entries(scenes)) {
  if (only && !name.startsWith(only)) continue;
  try { await run(); await shot(name); } catch (e) { console.log('FAILED', name, e.message); }
}
// Back to dark for the next run.
if (!only || only.startsWith('10')) { await b.goto(`${home}/settings`, 3000); await b.tap('Dark', 800); }
b.close();
