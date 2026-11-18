# Recommendation Journal

Save and remember what people recommend to you, who told you, and why: movies, video games, albums, and more. Mark them done and rate them when you've tried them.

Type in one box: it searches your list and allows you to add what's not there yet.

**Try it now: https://recommendation-journal.expo.app/**

Free and open source. The journal stays on your device. No account, no ads, no tracking.

You can sync your data between devices using your own Google Sheet, or import/export it as .xlsx or .csv.

## Get the app

- **Any computer browser:** https://sleep-journal.expo.app
- **iPhone App Store:** https://apps.apple.com/us/app/recommendation-journal/id6827766426
- **Android:** download the `.apk` from the [Releases](https://github.com/AlexisDrain/SleepJournal/releases) page.

## Trailer & Guide
https://github.com/user-attachments/assets/c766dac4-a9f0-4bc6-ab28-0ebb2e29d13b

## Forking

Publishing your own copy? These point at this project, so change them first:

- `app/app.json`: `owner`, `slug`, `extra.eas.projectId` and the `updates.url` built from it, the iOS
  `bundleIdentifier` and the Android `package`
- `app/eas.json`: `ascAppId` (your own app in App Store Connect)
- `app/src/lib/links.ts`: `SUPPORT_EMAIL`, `REPO_URL` and `SHEET_TEMPLATE_URL` (your own template sheet)
- `google-sheets/README.md`: the same template link

## Credits 

Developed with Claude Code.  

Trailer music: "Inspired"  
Kevin MacLeod (incompetech.com)  
Licensed under Creative Commons: By Attribution 4.0  
http://creativecommons.org/licenses/by/4.0/  
