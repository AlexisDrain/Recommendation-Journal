# Recommendation Journal

A new app by Alexis Drain (GitHub `AlexisDrain`, Expo account `alexisdrain`), inspired by their
earlier app **Sleep Journal** at `D:\DProjects\ReactNative\SleepJournal`. Start from scratch,
except for the pieces listed under "Bring over from Sleep Journal".

**What it is (decided 2026-10-21):** a list of things people recommended to you: title,
category (each its own Google Sheet tab, with its own words like "Want to watch" / "Watched"),
who recommended it, why, status, rating (❌ ✅ 👍 ❤️), date recommended and date experienced.
The goal is as few taps as possible: one box on the list screen both searches and adds. Screens:
List and Settings. See README.md and DEVELOPING.md. `DontCommit-StudyOnly.xlsx` is Alexis's old
hand-made list, for study only: never commit it.

## Keep from Sleep Journal

The ideas Alexis wants to keep:
- **Web + mobile from one codebase** (Expo / React Native, TypeScript, Expo Router), the web
  version hosted on EAS Hosting and the phone version delivered through EAS Update to Expo Go.
- **Local-first data** (SQLite on the device, no server, no account) with optional **two-way sync
  through the user's own private Google Sheet** via an Apps Script web app.
- **The look and the settings**: the dark design, the Display setting (dark / light / light by
  day), and the Settings screen's structure.

## Bring over from Sleep Journal (adapt, don't copy blindly)

Paths are under `D:\DProjects\ReactNative\SleepJournal\`.

- Look and layout: `app/src/lib/theme.ts` (colors swapped in place for dark/light),
  `app/src/lib/displayMode.ts` (dark / light / auto, `useThemeName()`), `app/src/components/ui.tsx`
  (Card, Row, Button, Chip, Input, Muted; styles rebuilt on theme change),
  `app/src/components/Panel.tsx` (bottom sheet on phones, centered dialog on wide screens),
  `app/src/lib/useLayout.ts` (left navigation rail at 900px and up), `app/src/lib/webHead.ts`.
- Settings: `app/src/app/(tabs)/settings.tsx` (cards: Display, Clock, Google Sheet, data
  export/import, Advanced, About with build number and support link), `app/src/lib/clockFormat.ts`
  (12/24-hour, default from the region at first launch).
- Storage: `app/src/db/migrations.ts` (`PRAGMA user_version`, append-only), `store.ts`,
  `transaction.ts` (web has no exclusive transactions), `webStorage.ts` (one browser tab owns
  the database), `app/metro.config.js` (wasm for SQLite on the web).
- Google Sheet sync: `app/src/db/sync.ts` (push then pull, newest edit wins by an "Updated" time,
  connection = Web app URL + secret key, `tidyConnection` forgives paste mistakes),
  `app/src/components/GoogleSheetCard.tsx`, and `google-sheets/SleepJournalSync.gs` +
  `google-sheets/README.md` (`@OnlyCurrentDoc` and pinned `oauthScopes` so Google asks for one
  narrow permission; the key is tied to its spreadsheet so template copies get their own;
  `SCRIPT_VERSION` vs the app's `LATEST_SCRIPT_VERSION` drives an "update your script" note).
- Releasing: `app/scripts/release.js` (bumps `src/lib/buildInfo.json`, deploys web and publishes
  the EAS Update together so build numbers match), `app/app.json` with
  `"runtimeVersion": { "policy": "sdkVersion" }` (required for Expo Go), `app/eas.json`.

## Lessons from Sleep Journal

- Expo Go only loads updates whose runtime is `sdkVersion`; it only opens EAS Updates from
  projects your own account owns, so other people need the web version or an APK.
- Web SQLite: `withExclusiveTransactionAsync` is not supported; a second tab or a private window
  fails with "Invalid VFS state" unless one tab claims the database.
- Start the web dev server with `npx expo start --web --port 8081 < /dev/null` (with `CI=1` it
  doesn't watch files).
- Notifications in Expo Go: cancel all scheduled ones and re-plan; matching by identifier wasn't
  reliable. Re-plan one run at a time.
- Apps Script `Error 401: invalid_client` on first authorization: add a blank line to the script,
  save, wait a couple of minutes, reload, run again (Google creates the project's identity).
- The browser's time input follows the computer's regional format, not the app's 12/24 setting.

## How Alexis likes to work

- Free to run: no Apple Developer fee, free tiers only.
- Privacy matters: the Google Sheet stays private, the script asks for the narrowest permission,
  no personal data or keys in git, never paste secrets in chat. Commits use the GitHub noreply
  address (repo-local git config), real name.
- Alexis commits and pushes with GitHub Desktop. End replies that changed files with a reminder
  to commit. Don't commit for them.
- When releasing, publish web and phone together so the build numbers match.
- Alexis is on Windows and uses an iPhone. Explain in plain language.
