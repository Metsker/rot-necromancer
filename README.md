# rot-necromancer

Turn-based grid roguelike prototype. A necromancer raises the corpses his enemies leave behind,
commands them as an autonomous army, and sends squads one-way into the fog to buy map and gold
with their lives.

Floor 1 is playable: generated crypt, fog of war, tap-to-move, an autonomous army raised from
the corpses you step on, corpses that rot, level-ups, spawn pressure, a splitting boss guarding
the stair, and a per-turn autosave.

Balance is unproven - a scripted bot dies about half the time and has never reached the boss.

## Run

```sh
npm install
npm run dev     # generates assets, then serves
npm run check   # layout + sim assertions, no browser needed
```

`npm run gen` derives `src/tilemap.ts` and `public/dungeon-mode.png` from the asset pack; `dev` and
`build` run it automatically. Both are generated, so neither is committed.

## Stack

[rot.js](https://github.com/ondras/rot.js) `tile-gl` display, Svelte 5, Vite, TypeScript.

`src/sim/` is the game: pure state plus functions, no renderer import, so it runs headless under
`scripts/check-sim.ts`. `src/render.ts` draws that state and `App.svelte` wires input to it.

## Credits

Tileset and font: [Dungeon Mode](https://datagoblin.itch.io/dungeonmode) by datagoblin.
