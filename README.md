# ThemeGood

Customer pages share the homepage navigation through `public/site-header.js` and `public/site-header.css`. New customer pages should include the `shared-site` body class, a `data-site-header` mount and its script before page scripts. `public/mobile-layout.css` handles storefront spacing and product layouts; header offsets follow the measured announcement and navigation height.

## Run Locally

Open a terminal in the project folder. On this Windows computer:

```powershell
Set-Location -LiteralPath 'C:\Theme Good Web'
```

Environment files, website assets, uploads, and migrations resolve from the project folder, so moving the folder does not require changing drive letters in the application. The backup script also saves into this folder's `backups` directory regardless of where it is launched.

1. Copy `.env.example` to `.env`
2. Fill in `DATABASE_URL`, `ADMIN_PASSWORD`, and `JWT_SECRET`
3. Install dependencies:

```bash
npm install
```

4. Start in development mode:

```bash
npm run dev
```

5. Start in normal mode:

```bash
npm start
```

The site will run on `http://localhost:3000` unless `PORT` is overridden.

## Event gallery

The gallery shows one card per event. Opening an album shows a popup over the gallery with its shared description and a scrollable photo grid; photos open in a larger viewer with arrows, keyboard navigation, mobile swipe, and zoom. Closing the viewer returns to the album; closing the album restores the gallery position. Events are ordered by sort order, then newest event date.

In **Admin → Gallery**, enter the event name, shared description, optional date and location, and select multiple JPG, PNG, or WebP photos (up to 50 MB each, 500 photos per album). Saving also uploads any selected files. Set the cover, reorder photos with the arrows, add optional individual captions, or remove photos, then save. Failed uploads remain selected for retry; successful uploads are retained in the form. Unchecking Active hides the entire album.

Existing gallery entries remain as single-photo albums. Select entries belonging to the same event and choose **Combine selected albums**. The first selected album supplies the event details and cover; all photos are retained, and the other selected entries are removed in one database transaction. Only albums with matching visibility can be combined.

Deploy `gallery-albums.js` and `migrations/2026-10-07-gallery-albums.sql` together with the updated server and public files, then restart the server. The additive schema migration runs on the first gallery request; the database role needs permission to alter `gallery_items`. If migrations are managed separately, run that SQL before restarting. Existing images are not rewritten or deleted.
