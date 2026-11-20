# Family Emergency Food Planner

An offline web app for planning a family's emergency food supply. It works on phones, tablets
and computers, and can keep several devices in sync.

- **Private surveys:** each person rates shelf-stable foods, one at a time, on a shared or their own device.
- **Safety first:** allergies, diets and strict intolerances keep a food out of the stockpile
  entirely; dislikes and lenient intolerances only count against it.
- **Three horizons:** a 3-day no-cook kit, a 14–30-day pantry and a 90–365-day reserve,
  with package counts, water, cooking fuel and an equipment checklist.
- **Inventory:** track what's on hand with best-by dates, see what's still to buy, and get
  "use soon" warnings.
- **Reports and backups:** a family summary that leaves out private details, a detailed
  Admin-only report, CSV/JSON export, and encrypted backup and restore.

## Privacy

All family data lives **on each device**, in the browser's local database, and this repository
contains only code. If you turn on sync, devices share it through Dexie Cloud, but only in
encrypted form: every row (and even which table it belongs to) is encrypted on the device with the
household key before it's sent, so the sync service can't read any of it. Sensitive fields (health conditions, private notes,
private custom fields) and backups are encrypted with AES-GCM under a key that is protected by
the Admin passphrase and a printable recovery key.

**Never commit backups or exported reports to this repository.** `.gitignore` blocks the usual
file names, but check before you push.

## Using it on a phone, tablet or computer

The app opens on **Inventory** (after the Admin passphrase, unless "Stay unlocked" is on).

1. Open the published site in the browser (Safari on iPhone/iPad).
2. Install it: on iPhone/iPad tap **Share → Add to Home Screen**; on Android or a computer use the
   browser's **Install app** option. The app then opens full-screen and works offline,
   including in Airplane Mode.
3. Set an Admin passphrase and **print or save the recovery key**. Without one of them, encrypted
   data and backups can't be opened by anyone.
4. Make a backup from **Backup** regularly and keep it off the device (for example in iCloud Drive).
   Browsers can clear website data if the device runs low on storage. Sync is not a backup:
   a deletion on one device is deleted everywhere.

When a new version is published, the app offers **Update now**. It never updates in the middle
of a survey.

## Sync across devices

Each device keeps a full copy and works offline; changes sync when online. Sign in once per device
with **one household email** (a one-time code is emailed). Sync keeps working while Admin is locked,
so surveys taken on any device show up everywhere.

- **First device** (the one with your data): Admin › Backup › *Sync across devices* → sign in.
  Its data is encrypted and uploaded.
- **Other devices:** on the welcome screen choose *Link to another device* (or, on a device that's
  already set up, use the same card in Backup). Sign in, then enter the Admin passphrase or the
  recovery key. Linking **replaces** that device's data with the family's.
- *Stop syncing on this device* keeps its data but stops sharing. Restoring a backup or erasing a
  device also unlinks it.

### Setting up the sync service (once)

1. `npx dexie-cloud create` (asks for your email and a code) → prints the database URL and writes
   `dexie-cloud.json` / `dexie-cloud.key` (both git-ignored; keep the key private).
2. Allow the app's addresses:
   `npx dexie-cloud whitelist https://dodonnell-code.github.io` and
   `npx dexie-cloud whitelist http://localhost:5173`.
3. Give the build the URL: `gh variable set DEXIE_CLOUD_URL --body https://<id>.dexie.cloud`
   (for local development, put `VITE_DEXIE_CLOUD_URL=https://<id>.dexie.cloud` in `.env.local`).
   Without it the app works as before, on one device, and the sync card is hidden.
4. Dexie Cloud's free plan includes 3 production users and 25 MB, plenty for one household
   login. New users start as 30-day evaluation users; make the household user a production user in
   the Dexie Cloud manager before that runs out, or syncing stops (the app keeps working offline).

## Development

```sh
npm install
npm run dev      # http://localhost:5173 (use localhost: encryption needs a secure context)
npm test         # unit tests (Vitest + fake-indexeddb)
npm run build    # production build in dist/
```

Built with React, TypeScript, Vite, Dexie (IndexedDB) and vite-plugin-pwa. Pushing to `main`
runs the tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

See [`docs/EXTENDING.md`](docs/EXTENDING.md) for adding new kinds of needs (e.g. medical
supplies) beyond food.

Shelf-life, water and fuel figures are planning guidance, not guarantees. Always check product
labels for allergens and storage instructions.
