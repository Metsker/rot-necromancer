<script lang="ts">
  import { Display } from "rot-js";
  import { TILE, TILE_MAP, SHEET, PALETTE } from "./tilemap";
  import { loadTileset } from "./tileset";

  const TARGET_TILE_CSS = 16;
  const MIN_COLS = 16;
  const MIN_ROWS = 20;
  const MAX_COLS = 48;
  const MAX_ROWS = 64;
  const DEBUG_PX = 88;

  const BG = PALETTE[2];
  const WALL = PALETTE[10];
  const FLOOR = PALETTE[6];
  const HERO = PALETTE[16];
  const BONE = PALETTE[23];
  const FOE = PALETTE[15];

  // Astral glyphs are drawn separately so these stay one code unit per cell
  const ROOM = [
    "┌──────────────┐",
    "│..............│",
    "│....†....r....│",
    "│..............│",
    "│.......†...k..│",
    "│..............│",
    "│....†.....g...│",
    "└──────────────┘",
  ];

  let host = $state<HTMLDivElement>();
  let status = $state("booting");
  let tapped = $state("-");
  let fps = $state(0);
  let stress = $state(false);
  let scale = $state(1);
  let dpr = $state(1);
  let cols = $state(MIN_COLS);
  let rows = $state(MIN_ROWS);

  const webgl2 = !!document.createElement("canvas").getContext("webgl2");
  const glyphs = Object.keys(TILE_MAP);
  const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

  // Scale is picked for legibility in device pixels, then the grid fills what is left
  function layout() {
    const d = window.devicePixelRatio || 1;
    const s = Math.max(1, Math.round((TARGET_TILE_CSS * d) / TILE));
    const cell = TILE * s;
    return {
      dpr: d,
      scale: s,
      cell,
      cols: clamp(Math.floor((window.innerWidth * d) / cell), MIN_COLS, MAX_COLS),
      rows: clamp(Math.floor(((window.innerHeight - DEBUG_PX) * d) / cell), MIN_ROWS, MAX_ROWS),
    };
  }

  function drawScene(d: Display, w: number, h: number) {
    d.clear();

    SHEET.forEach((row, y) =>
      row.forEach((ch, x) => {
        if (x < w && y < h) d.draw(x, y, ch, PALETTE[6 + ((x + y) % 18)], BG);
      }),
    );

    let y = Math.min(SHEET.length, h) + 1;
    PALETTE.forEach((c, i) => {
      const py = y + Math.floor(i / w);
      if (py < h) d.draw(i % w, py, "█", c, BG);
    });

    y += Math.ceil(PALETTE.length / w) + 1;
    ROOM.forEach((line, ry) =>
      [...line].forEach((ch, rx) => {
        const cy = y + ry;
        if (rx >= w || cy >= h - 1) return;
        const fg = ch === "." ? FLOOR : "rkg".includes(ch) ? FOE : ch === "†" ? BONE : WALL;
        d.draw(rx, cy, ch, fg, BG);
      }),
    );
    if (y + 4 < h - 1) d.draw(3, y + 4, "🕱", HERO, BG);

    d.drawText(0, h - 1, `%c{${FOE}}♥%c{${BONE}}12 %c{${PALETTE[20]}}⚉%c{${BONE}}8 †4/6`);
  }

  function drawStress(d: Display, w: number, h: number) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = glyphs[(Math.random() * glyphs.length) | 0];
        d.draw(x, y, ch, PALETTE[6 + ((Math.random() * 18) | 0)], BG);
      }
    }
  }

  $effect(() => {
    if (!host) return;
    if (!webgl2) {
      status = "WebGL2 unsupported - tile-gl cannot run here";
      return;
    }

    const missing = [...ROOM.join(""), "🕱", "█", "♥", "⚉", "†"].filter((c) => !(c in TILE_MAP));
    if (missing.length) status = `missing glyphs: ${missing.join(" ")}`;

    let disposed = false;
    let cleanup = () => {};

    loadTileset("dungeon-mode.png").then(
      (sheet) => {
        if (disposed || !host) return;

        const first = layout();
        ({ dpr, scale, cols, rows } = first);

        const display = new Display({
          layout: "tile-gl",
          width: first.cols,
          height: first.rows,
          tileWidth: TILE,
          tileHeight: TILE,
          tileSet: sheet,
          tileMap: TILE_MAP,
          tileColorize: true,
          bg: BG,
        });

        const canvas = display.getContainer() as HTMLCanvasElement;
        canvas.style.imageRendering = "pixelated";
        canvas.style.touchAction = "manipulation";
        canvas.style.display = "block";
        document.body.style.background = BG;
        host.appendChild(canvas);

        const onTap = (e: PointerEvent) => {
          const [x, y] = display.eventToPosition(e);
          tapped = `${x},${y}`;
        };
        canvas.addEventListener("pointerdown", onTap);

        const apply = (l: ReturnType<typeof layout>) => {
          canvas.style.width = `${(l.cols * l.cell) / l.dpr}px`;
          canvas.style.height = `${(l.rows * l.cell) / l.dpr}px`;
          if (!stress) drawScene(display, l.cols, l.rows);
          status = `${glyphs.length} glyphs, ${l.cols}x${l.rows} grid, ${TILE * l.scale}px tiles`;
        };

        const resize = () => {
          const l = layout();
          if (l.cols !== cols || l.rows !== rows) {
            display.setOptions({ width: l.cols, height: l.rows });
          }
          ({ dpr, scale, cols, rows } = l);
          apply(l);
        };
        window.addEventListener("resize", resize);
        apply(first);

        let frames = 0;
        let last = performance.now();
        const loop = () => {
          if (stress) drawStress(display, cols, rows);
          frames++;
          const now = performance.now();
          if (now - last >= 500) {
            fps = Math.round((frames * 1000) / (now - last));
            frames = 0;
            last = now;
          }
          raf = requestAnimationFrame(loop);
        };
        let raf = requestAnimationFrame(loop);

        cleanup = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", resize);
          canvas.removeEventListener("pointerdown", onTap);
          canvas.remove();
        };
      },
      () => (status = "tileset failed to load"),
    );

    return () => {
      disposed = true;
      cleanup();
    };
  });

  function toggleStress() {
    stress = !stress;
  }
</script>

<main style="--bg:{PALETTE[2]}; --ink:{PALETTE[23]}; --dim:{PALETTE[9]}">
  <div class="stage" bind:this={host}></div>
  <div class="debug">
    <button onclick={toggleStress} class:on={stress}>
      {stress ? "stop" : "stress"}
    </button>
    <span>×{scale} dpr{dpr}</span>
    <span>{fps} fps</span>
    <span>tap {tapped}</span>
    <span class="status">{status}</span>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    overscroll-behavior: none;
  }
  main {
    min-height: 100dvh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    background: var(--bg);
    color: var(--ink);
    font: 12px/1.4 ui-monospace, monospace;
  }
  .debug {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--bg) 80%, transparent);
  }
  button {
    min-height: 44px;
    min-width: 88px;
    border: 1px solid var(--dim);
    background: transparent;
    color: var(--ink);
    font: inherit;
    border-radius: 4px;
  }
  button.on {
    border-color: var(--ink);
  }
  .status {
    color: var(--dim);
    flex-basis: 100%;
    text-align: center;
  }
</style>
