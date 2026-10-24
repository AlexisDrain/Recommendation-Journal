// Publishes the app, stamping it with a build number first so you can tell which version a device runs
// (Settings → About shows it).
//
//   node scripts/release.js          web + phone, new build number
//   node scripts/release.js web      web only, new build number
//   node scripts/release.js phone    phone only, SAME build number (to match what is already on the web)
//
// "phone" publishes an EAS Update on the preview channel, which Expo Go picks up.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const target = process.argv[2] ?? 'all';
if (!['all', 'web', 'phone'].includes(target)) {
  console.error('Usage: node scripts/release.js [web|phone]');
  process.exit(1);
}
const app = path.join(__dirname, '..');
const infoFile = path.join(app, 'src', 'lib', 'buildInfo.json');
const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
const run = (cmd) => execSync(cmd, { cwd: app, stdio: 'inherit' });

if (target !== 'phone') {
  const now = new Date();
  info.version = JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')).expo.version;
  info.build += 1;
  info.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2) + '\n');
}
console.log(`\nRecommendation Journal ${info.version}, build ${info.build}\n`);

const site = `https://${JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')).expo.slug}.expo.app`;
const entryOf = (html) => html.match(/entry-[a-f0-9]+\.js/)?.[0] ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits up to a minute for the live site to serve this export. True once it does. */
async function siteIsLive(expected) {
  for (let i = 0; i < 6; i++) {
    try {
      const html = await (await fetch(`${site}/?release=${Date.now()}`, { cache: 'no-store' })).text();
      if (entryOf(html) === expected) return true;
    } catch {
      // offline for a moment: try again
    }
    await sleep(10_000);
  }
  return false;
}

(async () => {
  run('npx tsc --noEmit');
  let webOk = true;
  if (target !== 'phone') {
    fs.rmSync(path.join(app, 'dist'), { recursive: true, force: true });
    run('npx expo export --platform web');
    const expected = entryOf(fs.readFileSync(path.join(app, 'dist', 'index.html'), 'utf8'));
    const deployed = execSync('npx eas-cli@latest deploy --prod --non-interactive', { cwd: app, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
    process.stdout.write(deployed);
    // A deploy has reported success while the site kept the previous build (the upload was fine,
    // but the main address still pointed at the old one): check, and point it at the new one if so.
    if (!(await siteIsLive(expected))) {
      const id = deployed.match(/https:\/\/[a-z0-9-]+--([a-z0-9]+)\.expo\.app/)?.[1];
      console.log('\nThe website still shows the previous build. Pointing it at the new one…\n');
      if (id) run(`npx eas-cli@latest deploy:alias --prod --id ${id} --non-interactive`);
      else run('npx eas-cli@latest deploy --prod --non-interactive');
      webOk = await siteIsLive(expected);
    }
    console.log(webOk ? `\nChecked: ${site} serves build ${info.build}.` : `\nWARNING: ${site} still doesn't serve build ${info.build}.`);
  }
  if (target !== 'web') {
    run(`npx eas-cli@latest update --channel preview --environment preview --message "Build ${info.build}" --non-interactive`);
  }
  console.log(`\nPublished build ${info.build} (${target}).`);
  if (!webOk) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
