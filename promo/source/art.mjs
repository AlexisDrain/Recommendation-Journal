import fs from 'node:fs';
import path from 'node:path';
import { connect } from './cdp.mjs';
const b = await connect();
const url = 'http://127.0.0.1:8099/art.html';
const jobs = [
  ['header-5244x2950', 5244, 2950, 'header', false],
  ['header-3840x1646', 3840, 1646, 'header', true],
  ['search-5244x2950', 5244, 2950, 'search', false],
  ['search-3840x2560', 3840, 2560, 'search', false],
  ['search-1920x1280', 1920, 1280, 'search', false],
];
// node art.mjs [name] [--cards | --icon] [--named]: --cards draws three big list entries instead of
// the phones, --icon the big app icon;
// --named adds the app's name and subtitle. Into out/, out/icon/, out/named/ or out/icon-named/.
const named = process.argv.includes('--named');
const icon = process.argv.includes('--icon'); // the big-icon design instead of the phones
const cards = process.argv.includes('--cards'); // big recommendation cards instead of the phones
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
const dir = 'out' + (icon || cards || named ? '/' + [icon && 'icon', cards && 'cards', named && 'named'].filter(Boolean).join('-') : '');
fs.mkdirSync(dir, { recursive: true });
for (const [name, w, h, kind, wide] of jobs.filter((j) => !only || j[0] === only)) {
  await b.viewport(w / 2, h / 2, 2, false);
  await b.send('Page.navigate', { url: `${url}?kind=${kind}${wide ? '&wide=1' : ''}${named ? '&named=1' : ''}${icon ? '&icon=1' : ''}${cards ? '&cards=1' : ''}` });
  await b.sleep(2500);
  if (w <= 4096) await b.shot(`${dir}/${name}.png`);
  else for (const [i, x] of [[0, 0], [1, w / 4]]) { // too wide for one capture: two halves, joined afterwards
    const { data } = await b.send('Page.captureScreenshot', { format: 'png', clip: { x, y: 0, width: w / 4, height: h / 2, scale: 1 } });
    fs.writeFileSync(`${dir}/${name}.half${i}.png`, Buffer.from(data, 'base64'));
  }
  console.log(name);
}
b.close();
