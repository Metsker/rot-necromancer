<script lang="ts">
  import { Display } from "rot-js";
  import { TILE, TILE_MAP, SHEET, PALETTE } from "./tilemap";
  import { loadTileset } from "./tileset";

  const W = 24;
  const H = 28;

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
  const ROOM_X = 4;
  const ROOM_Y = 18;

  let host = $state<HTMLDivElement>();
  let status = $state("booting");
  let tapped = $state("-");
  let fps = $state(0);
  let stress = $state(false);
  let scale = $state(1);

  const webgl2 = !!document.createElement("canvas").getContext("webgl2");
  const glyphs = Object.keys(TILE_MAP);

  function drawScene(d: Display) {
    d.clear();

    // whole 256-glyph sheet, tinted to prove shader colorization
    SHEET.forEach((row, y) =>
      row.forEach((ch, x) => d.draw(x, y, ch, PALETTE[6 + ((x + y) % 18)], BG)),
    );

    // the 24 palette colors
    PALETTE.forEach((c, i) => d.draw(16 + (i % 8), Math.floor(i / 8), "█", c, BG));

    ROOM.forEach((line, y) =>
      [...line].forEach((ch, x) => {
        const fg = ch === "." ? FLOOR : "rkg".includes(ch) ? FOE : ch === "†" ? BONE : WALL;
        d.draw(ROOM_X + x, ROOM_Y + y, ch, fg, BG);
      }),
    );
    d.draw(ROOM_X + 3, ROOM_Y + 4, "🕱", HERO, BG);

    d.drawText(0, H - 1, `%c{${FOE}}♥%c{${BONE}}12 %c{${PALETTE[20]}}⚉%c{${BONE}}8 †4/6`);
  }

  function drawStress(d: Display) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = glyphs[(Math.random() * glyphs.length) | 0];
        d.draw(x, y, ch, PALETTE[6 + ((Math.random() * 18) | 0)], BG);
      }
    }
  }

  function fit(canvas: HTMLCanvasElement) {
    scale = Math.max(
      1,
      Math.min(
        Math.floor(window.innerWidth / (W * TILE)),
        Math.floor((window.innerHeight - 96) / (H * TILE)),
      ),
    );
    canvas.style.width = `${W * TILE * scale}px`;
    canvas.style.height = `${H * TILE * scale}px`;
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

        const display = new Display({
          layout: "tile-gl",
          width: W,
          height: H,
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
        host.appendChild(canvas);

        const onTap = (e: PointerEvent) => {
          const [x, y] = display.eventToPosition(e);
          tapped = `${x},${y}`;
        };
        canvas.addEventListener("pointerdown", onTap);

        const resize = () => fit(canvas);
        resize();
        window.addEventListener("resize", resize);

        drawScene(display);
        status = `${glyphs.length} glyphs, ${PALETTE.length} colors, ${W}x${H} @ ${TILE}px`;

        let frames = 0;
        let last = performance.now();
        const loop = () => {
          if (stress) drawStress(display);
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

<main style="--bg:{PALETTE[0]}; --ink:{PALETTE[23]}; --dim:{PALETTE[9]}">
  <div class="stage" bind:this={host}></div>
  <div class="hud">
    <button onclick={toggleStress} class:on={stress}>
      {stress ? "stop stress" : "stress test"}
    </button>
    <span>scale ×{scale}</span>
    <span>{fps} fps</span>
    <span>tap {tapped}</span>
  </div>
  <p class="status">{status}</p>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #000;
    overscroll-behavior: none;
  }
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
    background: var(--bg);
    color: var(--ink);
    font: 13px/1.4 ui-monospace, monospace;
  }
  .stage {
    display: flex;
    justify-content: center;
    padding-top: 8px;
  }
  .hud {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
  }
  button {
    min-height: 44px;
    min-width: 120px;
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
    margin: 0;
    color: var(--dim);
  }
</style>
