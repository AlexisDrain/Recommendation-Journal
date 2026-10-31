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

`npm test` runs the tests in `app/tests`: the sync between two devices, end to end, with the real
sheet script running against an in-memory spreadsheet (`tests/stubs/sheet-script.cjs`).

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

The script has one `sync` action ([`sync.ts`](app/src/db/sync.ts) ↔
[`RecommendationJournalSync.gs`](google-sheets/RecommendationJournalSync.gs)): it takes the app's
categories and changed items, writes the newer copy of each row (by `Updated`), keeps one tab per
category, and (with `pull`) sends back the categories and every row whose hidden **Changed**
column (the sheet's own clock) is at or after the app's last pull. Using the sheet's clock for
"what's new" means a device that syncs late never makes another device miss its edits. A category
made on two devices before they first synced is merged by name (`aliases`).

The app calls it twice per sync, **receive first, then send**, so it can merge **field by field**:
- `items.unsynced` lists the fields changed on this device and not sent yet (`rating note`). A
  trigger keeps it for every write (migration 10); the sync puts it back after writing what came
  from the sheet, and empties it once the item was sent (only if it wasn't changed meanwhile).
- A row from the sheet replaces the item except those fields. If any are left, the item gets a
  time a second after the sheet's, so it wins when sent. Two devices that each changed a different
  field of the same item both keep their change, whichever saved last.
- A deletion from another device beats edits made here to other fields (they're kept, for Recently
  deleted), but not a restore made here that wasn't sent yet.
- The Priority renumbering after a sync marks only `queuePos`, and only on items whose number changed.
- Tested end to end in `app/tests/sync-merge.test.mts` (`npm test`).

Saving never waits for the sheet: changes are saved on the device, and the sync follows a few
seconds later in the background, or at once when the app is left. A change made during a sync goes
out right after it. Each request gives up after 90 seconds, so a phone suspending the app mid-request
can't block later syncs. iOS and Android may pause the app as soon as it's left, so a quick exit can
leave a change unsent until the next open: Settings → Google Sheet then shows "1 recommendation
waiting to sync". A failed sync shows a message on the list with Retry, and "⚠ Sync failed" on the
Sync button.

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
| Anyone on Android | The `.apk` on GitHub Releases (below) | Free tier |
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

**Android APK on GitHub Releases.** Android ships as an APK, with no Play Store. Ordinary changes
reach it as over-the-air updates (`production` channel). A new APK is only for native changes: an
Expo SDK upgrade, a new package with native code, or native settings in `app.json`. Stop the web
dev server, then:

```bash
cd app
npx eas-cli@latest build -p android --profile apk
```

The version code goes up by itself. The first build creates the signing key on Expo's servers:
every APK has to use that same key, or it can't install over the previous one. Never commit signing
files. Then publish a GitHub release tagged `android-<versionCode>`, e.g. `android-12`, with the
`.apk` attached. Don't publish before testing on a real Android phone: keyboard, date pickers,
pull-to-sync, export and import, and the back button.

Installed APKs ask GitHub for the latest release once a day (`src/lib/apkUpdate.ts`) and show a
notice if its number is higher. That never runs on iPhone, the web or Expo Go, and the repo has to
be public for it to work. If this ever goes on Google Play, turn the check off for Play installs.

## Privacy & security notes

- No network requests unless you connect your own Google Sheet (then only to your sheet's script).
- Over-the-air updates come from Expo's servers. The Android APK also asks GitHub once a day whether
  a newer APK exists (off in Settings → About). GitHub can see the phone's internet address; no user
  data or device details are sent.
- Personal data is git-ignored (`*.csv`, `*.xlsx`, `*.db`); don't commit your own lists.
- Protect your Expo and GitHub accounts with 2FA: whoever controls the Expo project can publish updates.
