import path from 'node:path';
import { connect } from './cdp.mjs';
const b = await connect();
await b.viewport(393, 852, 3);
await b.goto('http://localhost:8081/', 5000);
for (const t of ['Citizen Kane', 'The Godfather', 'The Count of Monte Cristo']) {
  await b.tap(t, 1200);
  await b.tap('Delete', 1500);
  console.log('deleted?', t, !(await b.ev(`document.body.innerText.includes(${JSON.stringify(t)})`)));
}
await b.send('Page.setInterceptFileChooserDialog', { enabled: true });
const chosen = new Promise((r) => b.on((m) => m.method === 'Page.fileChooserOpened' && r(m.params)));
await b.goto('http://localhost:8081/settings', 4000);
await b.tap('Import .xlsx or .csv', 1500);
const p = await Promise.race([chosen, b.sleep(5000).then(() => null)]);
console.log('chooser', !!p);
if (p) await b.send('DOM.setFileInputFiles', { files: [path.resolve('demo.csv')], backendNodeId: p.backendNodeId });
await b.sleep(4000);
console.log("import sent");
await b.goto('http://localhost:8081/', 4000);
console.log(await b.ev(`document.body.innerText.slice(0, 300)`));
b.close();
