# Family Emergency Food Planner

An offline, iPad-first web app for planning a family's emergency food supply.

- **Private surveys:** each person rates shelf-stable foods on the iPad, one at a time.
- **Safety first:** allergies, diets and strict intolerances keep a food out of the stockpile
  entirely; dislikes and lenient intolerances only count against it.
- **Three horizons:** a 3-day no-cook kit, a 14–30-day pantry and a 90–365-day reserve,
  with package counts, water, cooking fuel and an equipment checklist.
- **Inventory:** track what's on hand with best-by dates, see what's still to buy, and get
  "use soon" warnings.
- **Reports and backups:** a family summary that leaves out private details, a detailed
  Admin-only report, CSV/JSON export, and encrypted backup and restore.

## Privacy

All family data stays **on the device**, in the browser's local database. Nothing is sent to a
server, and this repository contains only code. Sensitive fields (health conditions, private notes,
private custom fields) and backups are encrypted with AES-GCM under a key that is protected by
the Admin passphrase and a printable recovery key.

**Never commit backups or exported reports to this repository.** `.gitignore` blocks the usual
file names, but check before you push.

## Using it on an iPad

1. Open the published site in **Safari**.
2. Tap **Share → Add to Home Screen**. The app then opens full-screen and works offline,
   including in Airplane Mode.
3. Set an Admin passphrase and **print or save the recovery key**. Without one of them, encrypted
   data and backups can't be opened by anyone.
4. Make a backup from **Backup** regularly and keep it off the iPad (for example in iCloud Drive).
   Safari can clear website data if the device runs low on storage.

When a new version is published, the app offers **Update now**. It never updates in the middle
of a survey.

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
