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
for (const [name, w, h, kind, wide] of jobs.filter((j) => !process.argv[2] || j[0] === process.argv[2])) {
  await b.viewport(w / 2, h / 2, 2, false);
  await b.send('Page.navigate', { url: `${url}?kind=${kind}${wide ? '&wide=1' : ''}` });
  await b.sleep(2500);
  if (w <= 4096) await b.shot(`out/${name}.png`);
  else for (const [i, x] of [[0, 0], [1, w / 4]]) { // too wide for one capture: two halves, joined afterwards
    const { data } = await b.send('Page.captureScreenshot', { format: 'png', clip: { x, y: 0, width: w / 4, height: h / 2, scale: 1 } });
    fs.writeFileSync(`out/${name}.half${i}.png`, Buffer.from(data, 'base64'));
  }
  console.log(name);
}
b.close();
