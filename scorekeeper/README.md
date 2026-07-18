# Card Table — score helper

A mobile-first Angular app for scoring zero-sum card games. Count each
loser down in −5 steps, leave the winner blank, tap the tick to fill the
winner and start the next round. Reveal a settle-up table on demand.
Games auto-save to your browser (localStorage) and it installs as a PWA.

## Requirements
- Node.js 20+ (built and tested on Node 22)
- npm

## Getting started
```bash
npm install        # first time only
npm start          # dev server with live reload -> http://localhost:4200
```

## Testing
```bash
npm test           # unit tests (Karma + Jasmine, opens Chrome)
```
Core scoring rules are covered in `src/app/scoring.spec.ts`
(auto-balance on tick, one-positive-per-round, multiples of 5, totals).

## Build for production
```bash
npm run build      # outputs to dist/scorekeeper/browser
```
Serve that folder over HTTPS (or localhost) to get the installable PWA
and offline support.

## Where things live
- `src/app/scoring.ts` — pure game logic (no framework), unit-tested
- `src/app/game.service.ts` — state via signals + localStorage autosave
- `src/app/app.component.*` — the UI (setup, board, settle-up)
- `src/styles.css` — theme variables and fonts
