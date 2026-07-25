# rot-necromancer

Turn-based grid roguelike prototype. A necromancer raises the corpses his enemies leave behind,
commands them as an autonomous army, and sends squads one-way into the fog to buy map and gold
with their lives.

Currently a rendering spike only - no game logic yet.

## Run

```sh
npm install
npm run dev
```

`npm run gen` derives `src/tilemap.ts` and `public/dungeon-mode.png` from the asset pack; `dev` and
`build` run it automatically. Both are generated, so neither is committed.

## Stack

[rot.js](https://github.com/ondras/rot.js) `tile-gl` display, Svelte 5, Vite, TypeScript.

## Credits

Tileset and font: [Dungeon Mode](https://datagoblin.itch.io/dungeonmode) by datagoblin.
