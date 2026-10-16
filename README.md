# Scholastic Bowl Tournament Manager

An open-source tool for running scholastic bowl (quiz bowl) tournaments that
works with **no internet at the venue**. Everything runs in the browser and is
saved on the device. There is no server and no account.

## What it does

- **Every common format**, chained into as many phases as you need:
  - Round robin (single or double)
  - Pools (snake-seeded for balance, or tiered for championship/consolation playoffs), with optional carryover games
  - Single elimination (byes for any field size, optional third-place game)
  - Double elimination (with or without the "if necessary" second final)
  - Swiss (paired round by round, no rematches)
- **Pools into playoffs**: seed the next phase from the top N per pool or overall, then adjust seeds by hand.
- **Scores**: enter final scores, or tossups/powers/negs and bonus points and let the app add them up. Forfeits supported. Bracket games refuse ties.
- **Scoring presets** for IHSA, NAQT and ACF, or custom point values.
- **Standings** with configurable tiebreakers (record, head-to-head among tied teams, point differential, PPG, points allowed, PPB). Unbroken ties are shown, not hidden.
- **Brackets** drawn as you go, with final placements.
- **Rooms** assigned automatically each round and editable per game.
- **Printing** of schedules and standings, a projector view for the hallway screen, and CSV download.
- **Backups** as a JSON file, and **merging results** from a second scorekeeping laptop.

## Using it at a tournament

Pick one of these:

1. **Install it ahead of time (recommended).** Open the hosted app once while you have internet and choose *Install* in the browser (Chrome, Edge, or Safari "Add to Home Screen"). It then opens with no connection.
2. **Single file on a USB stick.** Run `npm run build` and copy `dist/scholastic-bowl.html` to the laptop. Double-click it to open in a browser. No install or internet needed.
3. **Serve it to other devices on a local network.** On one laptop, run `npm start` and open `http://<that laptop's address>:8080` on the others. (Each device keeps its own data; use Backup > Merge results to combine scores.)

Tip: download a backup file after every round. Browser storage is reliable, but a dead laptop is not.

## Development

Requires Node 20 or newer. There are no dependencies.

```sh
npm test        # run the tests
npm start       # serve the app at http://localhost:8080
npm run build   # write the single-file version to dist/
```

The code is plain JavaScript modules with no build step:

- `src/core/` holds the tournament logic (scheduling, brackets, standings, scoring). It has no browser code and is covered by the tests in `test/`.
- `src/ui/` holds the screens.
- `sw.js` is the offline cache. Add new files to its `ASSETS` list (a test checks this) and bump `CACHE_VERSION` on each release.

Tournament files are plain JSON (`schemaVersion` 1), so other tools can read them.

## License

MIT. See [LICENSE](LICENSE).
