# CardKeeper — MTG card scanner, collection & deck builder (PWA)

Static React + TypeScript app (Vite). No backend: all data lives on the device in IndexedDB;
backup/restore via JSON export/import (Settings → Backup & share).

## Features
- **Scan**: live camera with a card-shaped guide (getUserMedia) or photo/upload (`capture="environment"`).
  Tesseract.js OCR reads the title bar (falls back to scanning the whole photo), then Scryfall
  fuzzy/autocomplete resolves the name; you confirm, change printing, or type the name. Batch mode with qty, foil/etched, owners, undo.
- **Collection**: owner groups (Ari, Max, … multiple per card), filters (owner, color, type, MV, rarity, set, foil, min value), sort (incl. value), grid/list.
- **Value**: Scryfall USD prices (foil/etched aware) × qty, totals overall and per owner, top 10, "refresh prices" via `/cards/collection` (75 ids per request).
- **Decks**: 60-card (Casual/Standard/Pioneer/Modern) or 100-card Commander generator — 10 strategies,
  3 difficulty levels, pool = owned only / owned + missing / any. Curve chart, role breakdown, owned vs missing + est. cost,
  game plan & piloting tips, swap cards, save, export (Arena / MTGO text).
- **Pluggable games**: `src/games/types.ts` `GameAdapter`; MTG in `src/games/mtg/`, Pokémon stub in `src/games/index.ts`.

## Dev
```
npm install
npm run dev          # http://localhost:5173
npm run build        # -> dist/
node serve.mjs 4173  # serve dist/
npx tsx tests/decks.test.mts   # deck generator + legality checks (hits Scryfall)
node tests/e2e.mjs             # browser e2e at phone size (needs serve.mjs running), screenshots -> screenshots/
```
Scryfall limits: search/named/collection 2 req/s, others 10 req/s — enforced in `src/games/mtg/scryfall.ts`.

## Hosting
Camera access needs HTTPS. `dist/` is fully static with relative paths, so any static host works
(GitHub Pages workflow included in `.github/workflows/pages.yml`, or Cloudflare Pages / Netlify drag-and-drop of `dist/`).
