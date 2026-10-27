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
trailer/          the animated trailer page (open index.html in a browser; ?t=12 opens paused at 12 s)
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
- **A snapshot of that list** (`recjournal.snapshot.v1`, localStorage on the web, AsyncStorage on
  phones) is shown the moment the app starts, because opening SQLite can take seconds in some
  browsers. The database is opened as soon as the store loads and replaces the snapshot when read.
- **Categories and items have a `uid`** that's the same on every synced device. The starter
  categories have fixed uids (`default-movie`…), so new devices pair up with the sheet's tabs.
- **A new install starts with examples**: The Count of Monte Cristo and The Godfather (migration 2,
  only when there are no items yet) and Citizen Kane (migration 3, only while the list holds nothing
  but the examples); migration 4 adds the `author` column and the examples' authors. Fixed uids (`example-…`) so devices share them, and `updated_at = ''` so they
  stay out of the Google Sheet unless edited. To add another example later, append a migration
  like 3; don't edit shipped ones.
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

Saving never waits for the sheet: changes are saved on the device, and the sync follows a few
seconds later in the background (a change made during a sync goes out right after it). A failed
sync shows a message on the list with Retry, and "⚠ Sync failed" on the Sync button.

Every call into Google Sheets is slow (often 0.1 s or more), so the script keeps them few: it
reads the tabs and its saved notes once per sync (`context_`), only redoes tab layout (columns,
drop-downs, hiding, order) when that changed, only rewrites the Categories tab when it changed,
and only reads tabs touched since the app's last sync (`CHANGED_<tab>` notes, set when the script
writes a tab and by `onEdit`). The app's first sync after opening sends `full: true` to read every
tab anyway, in case an edit's note went missing. A sync with nothing to send is ~20 calls.

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
npm run release        # new build number, then web (EAS Hosting) + phone (EAS Update, preview and production channels)
```

`npm run release:web` publishes only the web version (new build number); `npm run release:phone`
sends that same build to the phone. **Settings → About** shows the version and build number.
Stop the web dev server first: the two share Metro's cache, and the phone export can fail on it.

`app.json` uses `"runtimeVersion": { "policy": "sdkVersion" }`, the runtime Expo Go has. Expo Go
only opens EAS Updates from projects your own Expo account owns, so other people need a build:

| Who | How | Cost |
|---|---|---|
| You, in Expo Go | `npm run release:phone` (preview channel) | Free |
| Anyone, in a browser | https://recommendation-journal.expo.app (EAS Hosting) | Free tier |
| Anyone on Android | `npx eas-cli@latest build -p android --profile preview` → share the `.apk` | Free tier |
| Testers on iPhone | TestFlight (below) | Apple Developer Program |

**TestFlight.** The installed app follows the `production` update channel, which `npm run release`
also publishes to, so testers get each release without a new build. A new build is only needed
when the native side changes (a new Expo SDK, or a package with native code). Build it in the
cloud and send it to App Store Connect in one go (it asks you to sign in to Apple the first time,
and sets up the app's certificates and its App Store Connect entry):

```bash
cd app
npx eas-cli@latest build -p ios --profile production --auto-submit
```

When it's processed (an email from Apple, 10–30 minutes later), add testers in App Store Connect →
the app → TestFlight. The app's ID is `io.github.alexisdrain.recommendationjournal`.

## Privacy & security notes

- No network requests unless you export or connect your own Google Sheet (then only to your sheet's script).
- Personal data is git-ignored (`*.csv`, `*.xlsx`, `*.db`); don't commit your own lists.
- Protect your Expo and GitHub accounts with 2FA: whoever controls the Expo project can publish updates.
