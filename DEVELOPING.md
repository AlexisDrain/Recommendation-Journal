# Developing Recommendation Journal

Notes for working on the code. The [README](README.md) is for people using the app.

Built with Expo (React Native + TypeScript, Expo Router) and **SQLite** with hand-written SQL.
Started from the pieces of [Sleep Journal](https://github.com/AlexisDrain/SleepJournal) worth
keeping: the look, the Display setting, local-first storage, Google Sheet sync and releasing.

```
app/
  src/app/        screens (Expo Router): the list (index), Settings
  src/db/         migrations.ts (schema), store.ts (queries + in-memory copy), sync.ts (Google Sheet),
                  rowFormat.ts (spreadsheet columns), exchange.ts (export/import), xlsx.ts
  src/components/ the add/edit panels, list rows, Settings cards
  src/lib/        types, dates, ratings, search, category word guesses
  scripts/        release.js (publish web + phone), make-icons.py (app icons; needs Python + Pillow)
  public/         web icons and manifest
google-sheets/    the optional Google Sheet sync script and its setup guide
```

## Run it

You need Node 22+, and **Expo Go** on your phone, signed in to the same free Expo account as the
CLI.

```bash
cd app
npm install
npx expo login
npx expo start        # scan the QR code with the phone; press w for the web version
```

For the web version alone: `npx expo start --web --port 8081 < /dev/null`.

## How the data works

- **One SQLite file on the device** (`recommendations.db`; in a browser, SQLite compiled to
  WebAssembly, one tab at a time). The schema lives in [`src/db/migrations.ts`](app/src/db/migrations.ts);
  `PRAGMA user_version` records which migrations have run. After a release, never edit a shipped
  migration; append a new one. (Migration 1 inserts the starter categories from
  `DEFAULT_CATEGORIES`, so changing that list only affects new installs.)
- **Everything is also kept in memory** ([`store.ts`](app/src/db/store.ts) `useData()`), so search
  and filters run as you type. Every write reloads it.
- **Categories and items have a `uid`** that's the same on every synced device. The starter
  categories have fixed uids (`default-movie`…), so new devices pair up with the sheet's tabs.
- **Deleting keeps a tombstone** (`deleted = 1`) so the deletion reaches the sheet and other devices.
- **Dates** are text: `2026-10-21`, or `2026-10` / `2026` when that's all that's known.
  **Updated** times are UTC (`2026-10-21T18:30:00Z`) and compare as text: the newest edit wins.

## How the sync works

One `sync` request per sync ([`sync.ts`](app/src/db/sync.ts) ↔
[`RecommendationJournalSync.gs`](google-sheets/RecommendationJournalSync.gs)): the app sends all
its categories and the items changed since the last sync; the script merges them (newest
`Updated` wins), keeps one tab per category, and sends back the categories and every row whose
hidden **Changed** column (the sheet's own clock) is at or after the app's last pull. Using the
sheet's clock for "what's new" means a device that syncs late never makes another device miss its
edits. A category made on two devices before they first synced is merged by name (`aliases`).

## Releasing

Before the first release, create the EAS project once (adds `extra.eas.projectId` and
`updates.url` to `app.json`):

```bash
cd app
npx eas-cli@latest init
npx eas-cli@latest update:configure
```

Then:

```bash
npm run release        # new build number, then web (EAS Hosting) + phone (EAS Update, preview channel)
```

`npm run release:web` publishes only the web version (new build number); `npm run release:phone`
sends that same build to the phone. **Settings → About** shows the version and build number.

`app.json` uses `"runtimeVersion": { "policy": "sdkVersion" }`, the runtime Expo Go has. Expo Go
only opens EAS Updates from projects your own Expo account owns, so other people need the web
version or an Android build (`npx eas-cli@latest build -p android --profile preview`).

## Privacy & security notes

- No network requests unless you export or connect your own Google Sheet (then only to your sheet's script).
- Personal data is git-ignored (`*.csv`, `*.xlsx`, `*.db`); don't commit your own lists.
- Protect your Expo and GitHub accounts with 2FA: whoever controls the Expo project can publish updates.
