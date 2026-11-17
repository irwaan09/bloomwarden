// Bloomwarden — entry for make.fun best-game-01 (Node 22, standard library only).
// An original arena-survivor roguelite: the last warden of a garden defends it
// against the Blight across 10 waves, with bosses on waves 5 and 10, 8 upgrades,
// pickups, synthesized sound and particles. The game itself is this directory's
// game/ folder, plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request).
// This program hands it in: it copies game/ and screenshots/ from beside this
// file to /output and writes /output/dossier.json, the summary the judge reads,
// with the vendored make.fun library. Put 3 or 4 PNG or JPEG screenshots in
// screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Before copying, this entrypoint checks that the game and its screenshots are
// actually present, so a missing file fails here with a clear message instead
// of producing a broken /output that the gate would refuse later.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Bloomwarden checks: the game entry file and its screenshots must exist
// before anything is copied, so a broken entry fails loudly here.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('Bloomwarden: game/index.html is missing; the game cannot be handed in.');
}
const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) {
  throw new Error('Bloomwarden: screenshots/ is missing; the judge needs 3 or 4 screenshots of the game.');
}
const shots = readdirSync(shotsDir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`Bloomwarden: expected 3 or 4 screenshots, found ${shots.length}.`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Bloomwarden handed in: ${shots.length} screenshots (${shots[0]} is the cover), dossier written to ${join(out, 'dossier.json')}.`);
