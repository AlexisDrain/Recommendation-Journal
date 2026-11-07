# Brief: App Store promo for Sleep Journal

Give this to a Claude session working in `D:\DProjects\ReactNative\SleepJournal`. It describes how
Recommendation Journal's `promo/` folder was made and what to watch out for, so Sleep Journal's can
be made the same way.

## What to make

Make a `promo/` folder in the Sleep Journal repo, laid out like
`D:\DProjects\AI\Recommendation-Journal\promo\`:

| Folder | What | Size |
|---|---|---|
| `screenshots/iphone/` | 10 screenshots with a short caption above the phone | 1179 × 2556 |
| `screenshots/iphone-plain/` | the same 10 without captions | 1179 × 2556 |
| `app-previews/` | up to 3 videos, 15–30 s each, the first one the strongest | 886 × 1920, 30 fps |
| `header/` | Header Asset | 5244 × 2950 and 3840 × 1646 |
| `search-results/` | Search Results Asset | 5244 × 2950, 3840 × 2560 and 1920 × 1280 |
| `source/` | the scripts that made everything, plus the made-up demo data | |
| `README.md` | the store text, ready to paste, and how to make it all again | |

Start from Recommendation Journal's `promo/source/` scripts (`cdp.mjs`, `load.mjs`, `shoot.mjs`,
`frame.py`, `art.html`, `art.mjs`, `rec.mjs`, `overlay.py`, `endcard.py`, `encode.sh`) and adapt
them: they're short and commented.

## How it works

- **Pictures come from the web version** at exact iPhone sizes, driven by a headless Microsoft Edge
  over the DevTools protocol (`cdp.mjs`, Node's built-in WebSocket). Start Edge with a fresh, empty
  profile folder each time:
  `msedge --headless=new --remote-debugging-port=9333 --user-data-dir=<empty folder> --force-device-scale-factor=2 about:blank`
- **iPhone look:** the app is captured between where the status bar and home bar go, then
  `frame.py` (Pillow) draws a status bar (9:41, Dynamic Island, signal, wifi, battery) and the home
  indicator. The web version ignores safe areas, so don't try to capture them.
- **Captions:** two short lines in the app's colors above a phone frame. Keep them benefits, not
  feature names ("Your list as a spreadsheet", "Rate it in one tap").
- **Art (header and search):** an HTML page (`art.html`) with the icon, the name, a one-line tagline
  and three tilted phones showing plain screenshots, captured at each size.
- **Videos:** `rec.mjs` records real use with `Page.startScreencast` (a dot shows each tap), then
  `encode.sh` (ffmpeg) adds the status and home bars, a 3-second end card, and music.

## Demo data

- Everything shown must be made up: no real entries, names or dates from Alexis's own journal. Put
  the demo data in `source/` (for a `.csv`, add an exception in `.gitignore`, which ignores `*.csv`).
- Show the app at its best: a few weeks of varied, realistic entries, so charts and lists look full.
- Ask Alexis before picking anything that names real works or people: they asked for changes here
  (titles they hadn't read or didn't like).

## Lessons from Recommendation Journal

- **Videos must use square pixels and the standard color format,** or Windows Media Player refuses
  them and VLC squashes them: in ffmpeg use `setsar=1` on every piece, `scale=out_color_matrix=bt709:out_range=tv`,
  `-pix_fmt yuv420p -color_range tv`, H.264 High, and an AAC stereo track.
- **Screencast frames come out at CSS-pixel size** unless Edge runs with `--force-device-scale-factor=2`.
- **Don't use virtual time** in Edge: screenshots hang while it's paused.
- **Captures wider than 4096 pixels hang:** capture two halves and join them with Pillow.
- **Hide scroll bars** in a fresh profile (a phone wouldn't show them): inject
  `* { scrollbar-width: none } ::-webkit-scrollbar { display: none }` on each page.
- **Scroll like a person:** before tapping something off screen, scroll with small mouse-wheel steps
  until it's fully inside its scrolling area, instead of jumping to it. Stop when it no longer
  moves, or the script waits for seconds at the end of the list.
- **Pause** about 1–2 seconds on a filled-in form before the final tap, so viewers can read it.
- **Look at the frames** (pull stills with ffmpeg every half second) before calling a video done:
  this is how a jumpy scroll and a half-hidden button were found.
- **Check for web layout bugs** in the pictures: Recommendation Journal's tab bar labels were cut off
  on phone-sized web pages, which needed a real fix in the app.
- **Music** must be licensed for use in ads. Kevin MacLeod's tracks (incompetech.com, CC BY 4.0)
  work if credited: on the video's end card and at the end of the Description, in the exact words
  the licence asks for.
- **Stay under 30 seconds** including the end card.

## The store text (README)

Write each field ready to paste, with its character count:

- **Promotional Text** (170 max; can change any time without review)
- **Subtitle** (30 max; in App Information)
- **Description** (4,000 max; not searched, but read by people deciding)
- **Keywords** (100 max, commas, no spaces; don't repeat words from the name or subtitle)
- **Support URL**, **Marketing URL** (the web app), **Copyright** ("2026 Alexis Drain"; Apple adds ©)

Claims must be true: check the code before writing "no tracking" or "works offline".

## Also tell Alexis

- **App Clip** and **iMessage App:** leave empty (optional, not used).
- **iPad screenshots:** only needed if `supportsTablet` is true in `app.json`.
- **App Review → Sign-in required:** untick it (no accounts). Never enter an Apple ID there. Add a
  review note that Google Sheet sync is optional.
- **Captioned screenshots are allowed,** as long as each one shows the real app.
- **Before submitting, make a fresh iOS build** so the app starts with the current code (an older
  build shows its old code on first launch). Only the build costs anything (free EAS allowance).
- **Never commit** personal data, keys or the real journal.
