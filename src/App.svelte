<script lang="ts">
  import Display from "rot-js/lib/display/display.js";
  import { TILE, TILE_MAP, PALETTE } from "./tilemap";
  import { loadTileset } from "./tileset";
  import { computeLayout } from "./layout";
  import { CREATURES, STAT_LABEL, type GameState, type Point, type Stat } from "./sim/data.ts";
  import {
    chooseStat,
    clearSave,
    commandCap,
    enemiesInView,
    hero,
    load,
    minions,
    newGame,
    playerStep,
    playerWait,
    routeTo,
    save,
  } from "./sim/game.ts";
  import { HUD_ROWS, cameraFor, render } from "./render.ts";

  const DEBUG_PX = 88;
  const STEP_MS = 70;
  const BG = PALETTE[2];

  let host = $state<HTMLDivElement>();
  let strip = $state<HTMLDivElement>();
  let cols = $state(1);
  let rows = $state(1);
  let unspent = $state(0);
  let over = $state("");
  let capLine = $state("");
  let logLine = $state("");
  let levelNo = $state(1);
  let roster = $state<{ name: string; hp: string }[]>([]);
  let rosterOpen = $state(false);
  let ready = $state(false);

  // The game object is deliberately outside Svelte's reactivity: it holds 3600-entry
  // arrays mutated every turn, and deep proxying that would cost more than it buys
  let game: GameState = load() ?? newGame(Math.floor(Math.random() * 1e9));
  let walk: Point[] = [];

  function sync() {
    unspent = game.unspent;
    over = game.over;
    capLine = `${minions(game).length}/${commandCap(game)}`;
    logLine = game.log[game.log.length - 1] ?? "";
    levelNo = game.level + 1;
    roster = minions(game).map((u) => ({
      name: CREATURES[u.creature].name,
      hp: `${u.hp}/${u.maxHp}`,
    }));
    if (game.over) clearSave();
    else save(game);
  }

  function act(fn: () => void) {
    if (game.over) return;
    fn();
    sync();
  }

  function tapAt(sx: number, sy: number) {
    if (game.over || unspent > 0) return;
    if (sy >= rows - HUD_ROWS) return;

    const h = hero(game);
    if (!h) return;
    const cam = cameraFor(game, cols, rows);
    const wx = sx + cam.x;
    const wy = sy + cam.y;

    const dx = wx - h.x;
    const dy = wy - h.y;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
      walk = [];
      act(() => playerStep(game, dx, dy));
      return;
    }
    walk = routeTo(game, wx, wy);
  }

  function stepWalk() {
    const next = walk[0];
    if (!next) return;
    const h = hero(game);
    if (!h) {
      walk = [];
      return;
    }
    walk = walk.slice(1);
    act(() => playerStep(game, next.x - h.x, next.y - h.y));
    // Travel stops the moment something hostile is in view, as tap-to-move promised
    if (enemiesInView(game) > 0 || game.unspent > 0) walk = [];
  }

  function restart() {
    clearSave();
    game = newGame(Math.floor(Math.random() * 1e9));
    walk = [];
    rosterOpen = false;
    sync();
  }

  const layout = () =>
    computeLayout({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      reserved: strip?.offsetHeight || DEBUG_PX,
    });

  $effect(() => {
    if (!host) return;
    if (!document.createElement("canvas").getContext("webgl2")) return;

    let disposed = false;
    let cleanup = () => {};

    loadTileset("dungeon-mode.png").then(
      (sheet) => {
        if (disposed || !host) return;

        const first = layout();
        cols = first.cols;
        rows = first.rows;

        const display = new Display({
          layout: "tile-gl",
          width: cols,
          height: rows,
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
          if (x >= 0 && y >= 0) tapAt(x, y);
        };
        canvas.addEventListener("pointerdown", onTap);

        const resize = () => {
          const l = layout();
          if (l.cols !== cols || l.rows !== rows) {
            display.setOptions({ width: l.cols, height: l.rows });
            cols = l.cols;
            rows = l.rows;
          }
          canvas.style.width = `${(l.cols * l.cell) / l.dpr}px`;
          canvas.style.height = `${(l.rows * l.cell) / l.dpr}px`;
        };
        window.addEventListener("resize", resize);
        window.addEventListener("orientationchange", resize);
        resize();
        sync();
        ready = true;

        let last = performance.now();
        let since = 0;
        const loop = (now: number) => {
          since += now - last;
          last = now;
          if (since >= STEP_MS) {
            since = 0;
            stepWalk();
          }
          render(display, game, cols, rows);
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
      () => {},
    );

    return () => {
      disposed = true;
      cleanup();
    };
  });
</script>

<main style="--bg:{PALETTE[2]}; --ink:{PALETTE[23]}; --dim:{PALETTE[9]}; --gold:{PALETTE[16]}">
  <div class="stage" bind:this={host}></div>

  <div class="bar" bind:this={strip}>
    <button onclick={() => act(() => playerWait(game))} disabled={!ready || !!over}>wait</button>
    <button onclick={() => (rosterOpen = !rosterOpen)} disabled={!ready}>army {capLine}</button>
    <span class="dim log">{logLine}</span>
  </div>

  {#if rosterOpen}
    <div class="sheet">
      <h2>Army {capLine}</h2>
      {#if roster.length === 0}
        <p class="dim">Nothing raised. Step onto a corpse to claim it.</p>
      {:else}
        <ul>
          {#each roster as r}
            <li><span>{r.name}</span><span class="dim">{r.hp}</span></li>
          {/each}
        </ul>
      {/if}
      <button onclick={() => (rosterOpen = false)}>close</button>
    </div>
  {/if}

  {#if unspent > 0}
    <div class="sheet">
      <h2>Level {levelNo}</h2>
      {#each Object.entries(STAT_LABEL) as [stat, label]}
        <button class="wide" onclick={() => act(() => chooseStat(game, stat as Stat))}>
          {label}
        </button>
      {/each}
    </div>
  {/if}

  {#if over}
    <div class="sheet">
      <h2>{over === "dead" ? "The necromancer falls" : "You descend"}</h2>
      <p class="dim">
        {over === "dead"
          ? "Your army crumbles with you."
          : "The stair closes behind you. Floor 2 is not built yet."}
      </p>
      <button class="wide" onclick={restart}>new run</button>
    </div>
  {/if}
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
    font: 13px/1.4 ui-monospace, monospace;
  }
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
    background: var(--bg);
  }
  .log {
    flex-basis: 100%;
    text-align: center;
    min-height: 1.4em;
  }
  button {
    min-height: 44px;
    min-width: 96px;
    border: 1px solid var(--dim);
    background: transparent;
    color: var(--ink);
    font: inherit;
    border-radius: 4px;
  }
  button:disabled {
    opacity: 0.4;
  }
  button.wide {
    width: 100%;
    text-align: left;
    padding: 0 12px;
  }
  .sheet {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(320px, calc(100vw - 32px));
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: var(--bg);
    border: 1px solid var(--dim);
    border-radius: 6px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    color: var(--gold);
  }
  p {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  li {
    display: flex;
    justify-content: space-between;
  }
  .dim {
    color: var(--dim);
  }
</style>
