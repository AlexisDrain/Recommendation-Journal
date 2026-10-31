# Recommendation-Journal

Remember what people recommend to you and why: movies, video games, albums, and more. Open-source and the journal stays on your device. No account, no ads, no tracking.

You can sync your data between devices using Google Sheet.

**Try it now: https://recommendation-journal.expo.app/**

## Get the app

- **Any phone or computer:** open https://sleep-journal.expo.app in your browser.
- **Android:** download the `.apk` from the [Releases](https://github.com/AlexisDrain/SleepJournal/releases)
  page (coming soon).
- **iPhone App Store:** not yet. Use the web version for now.

## Forking

Publishing your own copy? These point at this project, so change them first:

- `app/app.json`: `owner`, `slug`, `extra.eas.projectId` and the `updates.url` built from it, the iOS
  `bundleIdentifier` and the Android `package`
- `app/eas.json`: `ascAppId` (your own app in App Store Connect)
- `app/src/lib/links.ts`: `SUPPORT_EMAIL`, `REPO_URL` and `SHEET_TEMPLATE_URL` (your own template sheet)
- `google-sheets/README.md`: the same template link

## Credits 

Trailer music: "Inspired"
Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0
http://creativecommons.org/licenses/by/4.0/
