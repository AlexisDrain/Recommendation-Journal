# App Store page

Everything for the App Store Connect page: the words to paste in, and the pictures and videos to
upload. All the recommendations shown are made up (see `source/demo.csv`).

## Words

### Promotional Text (157 / 170 characters)

You can change this one any time, without sending a new version for review.

```
Alexis: Remember what people recommend to you (movies, games, albums, and more), who told you, and why. Search and add. No account, no ads.
Alexis: Remember what people recommend to you (movies, video games, albums, and more), and why.

Never forget a recommendation again. One box searches your list and adds new things. Rank what's next, rate what you've tried, and see who told you about it.
```

### Subtitle (30 / 30 characters)

Shown under the app's name. It's in the App Information section, not the version page.

```
Alexis: Save friends' recommendations
Alexis: Recommendations from friends
Alexis: Catalog media you want to see.
Remember who told you, and why
```

### Description

```
- Alexis:
Remember what people recommend to you, who told you, and why: movies, video games, albums, and more. Mark them done and rate them when you've tried them.

Type in one box: it searches your list and allows you to add what's not there yet.

Free and open source. The journal stays on your device. No account, no ads, no tracking.

You can sync your data between devices using your own Google Sheet, or import/export it as .xlsx or .csv.

Preview music: "Inspired" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

 - Claude

A friend swears by a book. A coworker says you have to see a show. Someone on a train writes a game's name on your ticket. Recommendation Journal is the one place to keep all of it, along with who told you and why.

ONE BOX DOES IT ALL
Start typing: the box searches everything on your list. If it isn't there yet, the same box adds it. No menus to dig through.

WHO TOLD YOU, AND WHY
Each recommendation keeps the person who recommended it and what they said, so you remember why it's worth your time.

YOUR OWN CATEGORIES
Movies, books, TV shows, video games, albums, recipes, or anything you like. Each category uses its own words: "Want to watch" and "Watched" for movies, "Want to read" and "Read" for books.

RANK WHAT'S NEXT
Put your must-try picks in Priority and drag them into order. Rate what you've tried in one tap, from 1 to 5 stars.

YOUR LIST AS A SPREADSHEET
See everything as a table, and export it as an .xlsx or .csv whenever you like. Import a list you already keep in a spreadsheet.

PRIVATE BY DESIGN
No account, no sign-up, no ads, no tracking. Your list is stored on your phone. If you want, you can sync it with your own private Google Sheet, so your phone and your computer share one list. The app never sees your Google login.

Also available as a web app, and free and open source.

Preview music: "Inspired" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/
```

### Keywords (98 / 100 characters)

Commas, no spaces. The app's name is already searched, so it isn't repeated here.

```
watchlist,reading list,to read,books,movies,shows,games,albums,recipes,tracker,suggestions,backlog
```

### Support URL

```
https://github.com/AlexisDrain/Recommendation-Journal/issues
```

### Marketing URL

The web version of the app.

```
https://recommendation-journal.expo.app
```

### Copyright

Apple adds the © itself.

```
2026 Alexis Drain
```

## Reviewer Notes
No account or sign-in is needed: everything is stored on the device. Syncing with a Google Sheet (Settings → Google Sheet) is optional and needs the user’s own Google Sheet; the rest of the app works fully without it.

## Pictures and videos

| Field in App Store Connect | File | Size |
|---|---|---|
| Header Asset | `header/header-5244x2950.png` (or `header-3840x1646.png`) | 5244 × 2950, 3840 × 1646 |
| Search Results Asset | `search-results/search-5244x2950.png` (or the 3840 × 2560 / 1920 × 1280 ones) | all three supported sizes |
| iPhone screenshots (6.1" / 6.3") | `screenshots/iphone/01…10` (with captions), or `screenshots/iphone-plain/` | 1179 × 2556 |
| iPhone app previews | `app-previews/1…3` | 886 × 1920, 30 fps, 21–28 s |

- **Header and Search Results:** on an iPhone the App Store shows only about the middle 40% of the
  width and the upper-middle half of the height of these, zoomed in. Phone screenshots there were
  too small to read. So they're the app's name, a subtitle ("Save recommendations from friends")
  and two of the app's own list entries, drawn big, all inside that small area
  (`node art.mjs --cards --named`; the entries are in `source/art.html`).
- **Screenshots:** upload them in number order. The first three are the ones most people see in
  search results. Use either the captioned set or the plain one, not a mix.
- **App previews:** H.264 .mp4 files with music: "Inspired" by Kevin MacLeod, the trailer's
  track (`promo/trailer/Inspired.mp3`). Its licence (CC BY 4.0) lets anyone use it, ads included, as
  long as it's credited, so each preview ends on a 3-second card with the credit, and the
  Description carries it too. Previews start muted on the App Store; people tap for sound.
  After uploading, App Store Connect asks for a poster frame: the moment shown before the video
  plays. Pick one from the app, not the credit card.
- **iPad:** not needed. The app is iPhone-only (`supportsTablet: false` in `app/app.json`), so App
  Store Connect shouldn't ask for iPad screenshots.

### Outside the App Store: `wide-header/`

The first header design: the app's name and one line on the left, three phones on the right
(Fiction books, Movies, Priority). Too wide for the App Store's crop, but good where the whole
picture shows. Made from the app as of build 84 (1–5 stars, the yellow ! for priorities).

| Where | File | Size |
|---|---|---|
| GitHub: Settings → General → Social preview | `wide-header/github-social-1280x640.png` | 1280 × 640 (under GitHub's 1 MB limit) |
| Product Hunt: gallery image (first one is the thumbnail in some places) | `wide-header/producthunt-1270x760.png` | 1270 × 760 |
| A banner: README top, Product Hunt maker page, social posts | `wide-header/banner-3840x1646.png` | 3840 × 1646 |

To make them again: steps 1–3 below (only `05-priority`, `06-movies` and `x-fiction` are needed),
copy `app/assets/icon.png` to `source/out/icon.png`, serve `source/`, then open
`art.html` at those sizes without `kind=` (`?wide=1` for the 3840 × 1646 banner).

The pictures come from the web version of the app, drawn at exact iPhone sizes, with an iPhone
status bar and home bar added. So the fonts are Windows' (Segoe UI) rather than the iPhone's, and
the emoji are Windows' too. If you'd rather show the real iPhone look, take screenshots on an
iPhone with a 6.1" or 6.3" screen. Those are already 1179 × 2556.

## What's an App Clip?

An App Clip is a tiny part of an app that opens instantly, without installing the whole app. It
usually opens from a QR code, an NFC tag or a link in Safari: for example, paying for parking or
renting a scooter. It needs extra native code and its own setup, and Recommendation Journal has
no use for one. Leave that section empty: it's optional.

## Making them again

After the app's look changes, `source/` can make everything again from the web version. You need
the dev server (`npx expo start --web --port 8081` in `app/`), Microsoft Edge, Python with Pillow,
and ffmpeg.

1. Start a headless Edge with its own test profile:
   `msedge --headless=new --remote-debugging-port=9333 --user-data-dir=<an empty folder> --force-device-scale-factor=2 about:blank`
2. In `source/`, set the welcome screen as seen once (see `load.mjs`), then run `node load.mjs`:
   it removes the three built-in examples and imports `demo.csv`.
3. Screenshots: `node shoot.mjs`, then `python frame.py`. Besides the ten, this makes
   `x-fiction.png` (the Fiction books list), used only on the header art.
4. Art: serve `source/` (`python -m http.server 8099`), then run `node art.mjs`.
5. Previews: `python overlay.py` and `python endcard.py`, then `node rec.mjs add` (and `rate`,
   `sheet`), then `sh encode.sh add` (and so on). `encode.sh` reads the music from
   `promo/trailer/Inspired.mp3`, or from the file named in `MUSIC`. The `rate` take marks Project Hail Mary as read, so import
   `demo.csv` into a fresh profile before taking it again.

The scripts read from and write to `raw/`, `out/` and `frames/` next to themselves: move the
results into the folders above.
