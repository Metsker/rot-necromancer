<script lang="ts">
  import { Display } from "rot-js";
  import { TILE, TILE_MAP, SHEET, PALETTE } from "./tilemap";
  import { loadTileset } from "./tileset";
  import { computeLayout } from "./layout";

  const DEBUG_PX = 88;
  const WIDE_COLS = 34;

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
  let strip = $state<HTMLDivElement>();
  let status = $state("booting");
  let tapped = $state("-");
  let fps = $state(0);
  let stress = $state(false);
  let scale = $state(1);
  let dpr = $state(1);
  let cols = $state(1);
  let rows = $state(1);

  const webgl2 = !!document.createElement("canvas").getContext("webgl2");
  const glyphs = Object.keys(TILE_MAP);

  const layout = () =>
    computeLayout({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      reserved: strip?.offsetHeight || DEBUG_PX,
    });

  function drawScene(d: Display, w: number, h: number) {
    d.clear();

    SHEET.forEach((row, y) =>
      row.forEach((ch, x) => {
        if (x < w && y < h - 1) d.draw(x, y, ch, PALETTE[6 + ((x + y) % 18)], BG);
      }),
    );

    // Short viewports put the rest beside the sheet rather than under it
    const wide = w >= WIDE_COLS;
    const ox = wide ? 17 : 0;
    let oy = wide ? 0 : Math.min(SHEET.length, h) + 1;
    const span = Math.max(1, w - ox);

    PALETTE.forEach((c, i) => {
      const py = oy + Math.floor(i / span);
      if (py < h - 1) d.draw(ox + (i % span), py, "█", c, BG);
    });

    oy += Math.ceil(PALETTE.length / span) + 1;
    ROOM.forEach((line, ry) =>
      [...line].forEach((ch, rx) => {
        const cx = ox + rx;
        const cy = oy + ry;
        if (cx >= w || cy >= h - 1) return;
        const fg = ch === "." ? FLOOR : "rkg".includes(ch) ? FOE : ch === "†" ? BONE : WALL;
        d.draw(cx, cy, ch, fg, BG);
      }),
    );
    if (ox + 3 < w && oy + 4 < h - 1) d.draw(ox + 3, oy + 4, "🕱", HERO, BG);

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
        window.addEventListener("orientationchange", resize);
        apply(first);
        requestAnimationFrame(resize);

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
          window.removeEventListener("orientationchange", resize);
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
  <div class="debug" bind:this={strip}>
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
    background: var(--bg);
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
  }
</style>
