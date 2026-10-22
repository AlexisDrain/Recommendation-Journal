# Google Sheet sync: setup

Recommendation Journal can keep your list in **your own private Google Sheet**: one tab per
category (Movie, Fiction book, Flash game…), and edits in either place sync both ways (the newest
edit of a row wins).

The app never asks for your Google login. Instead, a small script inside your sheet accepts
updates from the app when they carry your **secret key**. The sheet itself stays private: it is
never shared, and the script can only touch that one spreadsheet.

There are two ways to get the sheet. Both end with the same three steps.

| | Time | Choose it if |
|---|---|---|
| **A. Copy the template** | about 3 minutes | you want the quick route |
| **B. Build it yourself** | about 10 minutes | you'd rather read the code before running it |

Do this on a computer.

---

## A. Copy the template

1. Open the template: **[Recommendation Journal (template)](https://docs.google.com/spreadsheets/d/1idp3giIfKVU5MJIQfjVtpRjT35AVrN5mtU-xaHp1xyA/copy)**
2. Click **Make a copy**. Google mentions that an Apps Script file is attached: that is the sync
   script, which you can read any time under **Extensions → Apps Script**.

The copy is your own private spreadsheet. Nobody else, including whoever made the template, can see
it or its data, and it starts without a key: you create yours in step 1 below.

Now continue with **Finish the setup**.

## B. Build it yourself

1. Create a new Google Sheet (e.g. go to `sheets.new`) and name it, e.g. **Recommendations**.
2. In the sheet: **Extensions → Apps Script**.
3. Delete the sample code, paste the whole of
   [`RecommendationJournalSync.gs`](RecommendationJournalSync.gs), and click **Save**.
4. Limit what the script may access. Google works out a script's permissions by scanning its code,
   and that guess can include more than the script uses. This replaces the guess with an exact
   list of one permission:
   1. Click the gear icon (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**.
   2. Back in the **Editor**, open **`appsscript.json`** and add the `oauthScopes` line shown below.
      Keep the other lines as they are (yours may differ slightly), and make sure the line before
      it ends with a comma:

      ```json
      {
        "timeZone": "America/Los_Angeles",
        "dependencies": {},
        "exceptionLogging": "STACKDRIVER",
        "runtimeVersion": "V8",
        "oauthScopes": ["https://www.googleapis.com/auth/spreadsheets.currentonly"]
      }
      ```
   3. Click **Save**.

Now continue with **Finish the setup**.

---

## Finish the setup

Open the script editor from your sheet: **Extensions → Apps Script**.

### 1. Create your secret key

1. In the function dropdown at the top, pick **`setup`**, then click **Run**.
2. **If you get "Access blocked: Authorization Error … Error 401: invalid_client"**, Google hasn't
   finished setting up the script's sign-in yet. This happens on brand-new scripts; nothing is
   wrong with your account or the code. (No error? Skip to the next step.)
   1. Add a blank line anywhere in the code and click **Save**.
   2. Wait a couple of minutes, reload the editor page, and run `setup` again.
   3. Still there? Open the sheet in a private browser window signed in to only one Google
      account, and run `setup` from there.
3. Google asks you to authorize the script. Because it's a personal script and not a published
   app, it shows *"Google hasn't verified this app"*: click **Advanced → Go to … (unsafe)**.
4. Check what it asks for. It should be exactly one permission: **"View and manage spreadsheets
   that this application has been installed in"**, meaning this one spreadsheet. If it lists
   anything else, click **Cancel**, do step B.4, and run `setup` again.

### 2. Deploy it as a web app

1. **Deploy → New deployment**, then the gear icon → **Web app**.
2. **Execute as: Me**, **Who has access: Anyone**, then **Deploy**.
   *"Anyone" means the app can reach the script without a Google login. Every request still has
   to carry your secret key, and wrong keys are refused.*
3. Copy the **Web app URL** it shows. It ends in **`/exec`**. (You can find it again under
   **Deploy → Manage deployments**.)

### 3. Connect the app

The app asks for two things, in **Settings → Google Sheet**:

| Box in the app | Where to get it |
|---|---|
| **Web app URL** | The URL you just copied. It looks like `https://script.google.com/macros/s/…/exec` and must end in `/exec`, not `/dev`. |
| **Secret key** | Pick **`showConnectionCode`** in the function dropdown, click **Run**, and copy the long run of letters and numbers from the **Execution log**. |

Get them to your phone privately (a private note works; don't email or post them), paste each into
its box, and tap **Connect**. The app removes stray spaces and adds a missing `https://` for you.

The first sync sends your whole list. After that the app syncs by itself a few seconds after each
change and when you open the app. To use the web app and your phone with the same sheet, enter the
same two things on each.

## What the sheet looks like

- **One tab per category**, in the app's order. Columns: *Title, Status, Rating, Recommended by,
  Why, Recommended on, Experienced on*, then *Id* and *Updated* (grey, for the app's bookkeeping).
- **Status and Rating** have drop-down lists (`Want to watch` / `Watched`, `❌ Bad` … `❤️ Exceptional`),
  but typing works too: "watched", "yes" or "✓" count as done.
- **Dates** are written `2026-10-21`. A lone year (`2019`) or month (`2019-03`) is fine too.
- A **Categories** tab lists your categories and their words. A hidden **Deleted** tab notes what
  you deleted in the app, so your other devices delete it too. A hidden *Changed* column on each tab
  helps devices catch up; leave it be.

## Good to know

- **Keep the URL and key secret.** Anyone who has both can read and change your sheet. Don't commit
  them, post them or email them. If they ever leak, run **`rotateSecret`** and paste the new key into
  the app; the old one stops working.
- **Editing in Sheets is fine.** Changing a cell marks that row as updated, and the app picks it up
  on its next sync. **Typing a new row** (just a Title is enough) adds it to the app.
- **Adding a tab yourself** with a *Title* column makes a new category in the app.
- **Renaming a tab** renames the category, and renaming a category in the app renames its tab.
  Hiding a category hides its tab.
- **Your own columns are kept.** Add columns to the right; they stay with their row.
- **To delete something, delete it in the app.** Deleting a row in the sheet doesn't reach the app
  (the app would put it back the next time you change it).
- **Backups**: Google Sheets keeps every earlier version of the spreadsheet by itself:
  **File → Version history → See version history**. For a copy outside Google, use the app's export.

## Updating the script

A sheet's script doesn't update by itself. When the script changes, the app shows a note in
**Settings → Google Sheet** saying your sheet's script is an older version. To update:

1. In the script editor, replace all the code with the current
   [`RecommendationJournalSync.gs`](RecommendationJournalSync.gs) and click **Save**.
2. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**

Your Web app URL and secret key stay the same, so there is nothing to change in the app.

## For maintainers

When the script changes: paste the new code into the template sheet too (new copies get it), and
if the app should know about the change, bump `SCRIPT_VERSION` in the script and
`LATEST_SCRIPT_VERSION` in [`app/src/db/sync.ts`](../app/src/db/sync.ts) together.

The template is an ordinary Google Sheet with the script inside (and the `oauthScopes` line),
where `setup` was never run and nothing was deployed, shared as *Anyone with the link → Viewer*.
Its `…/copy` link is in route A above and in `SHEET_TEMPLATE_URL` in
[`app/src/lib/links.ts`](../app/src/lib/links.ts). A key only works in the spreadsheet it was made
in, so every copy creates its own.
