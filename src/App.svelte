<script lang="ts">
  import Display from "rot-js/lib/display/display.js";
  import { TILE, TILE_MAP, PALETTE } from "./tilemap";
  import { loadTileset } from "./tileset";
  import { computeLayout } from "./layout";
  import { type GameState, type Point, type Stat } from "./sim/data.ts";
  import {
    chooseStat,
    clearSave,
    drainHits,
    enemiesInView,
    hero,
    load,
    newGame,
    playerStep,
    playerWait,
    routeTo,
    save,
    setTarget,
    targetOf,
    unitAt,
    visible,
  } from "./sim/game.ts";
  import { type Panel, render, zoneAt } from "./render.ts";

  const STEP_MS = 70;
  const FLASH_MS = 170;
  const BG = PALETTE[2];
  const HURT_YOU = PALETTE[15];
  const HURT_THEM = PALETTE[17];
  const FATAL = PALETTE[23];
  const ORDER_MOVE = PALETTE[22];
  const ORDER_KILL = PALETTE[14];
  const ORDER_DENIED = PALETTE[6];
  // ponytail: a plain cap, so an unreachable mark cannot spin the clock forever
  const ENGAGE_LIMIT = 80;
  const STATS: Stat[] = ["might", "ward", "will"];

  let host = $state<HTMLDivElement>();
  let safe = $state<HTMLDivElement>();

  // Everything below is plain state: the whole interface is drawn into the grid,
  // so nothing here needs Svelte reactivity
  let game: GameState = load() ?? newGame(Math.floor(Math.random() * 1e9));
  let cols = 1;
  let rows = 1;
  let panel: Panel = "none";
  let walk: Point[] = [];
  let goal: Point | null = null;
  let engaging = 0;
  let flashes: { x: number; y: number; color: string; until: number }[] = [];

  function after() {
    const until = performance.now() + FLASH_MS;
    for (const h of drainHits()) {
      flashes.push({
        x: h.x,
        y: h.y,
        color: h.fatal ? FATAL : h.faction === "player" ? HURT_YOU : HURT_THEM,
        until,
      });
    }
    if (game.over) {
      panel = "over";
      clearSave();
    } else {
      if (game.unspent > 0) panel = "level";
      save(game);
    }
  }

  function act(fn: () => void) {
    if (game.over || panel === "level") return;
    fn();
    after();
  }

  function stop() {
    walk = [];
    goal = null;
    engaging = 0;
  }

  function newRun() {
    clearSave();
    game = newGame(Math.floor(Math.random() * 1e9));
    walk = [];
    goal = null;
    engaging = 0;
    flashes = [];
    panel = "none";
  }

  function onLine(index: number) {
    if (panel === "level") {
      chooseStat(game, STATS[index]);
      panel = game.unspent > 0 ? "level" : "none";
      save(game);
      return;
    }
    if (panel === "over") {
      if (index === 1) newRun();
      return;
    }
    panel = "none";
  }

  function onTap(sx: number, sy: number) {
    const zone = zoneAt(game, panel, cols, rows, sx, sy);
    if (zone.kind === "line") return onLine(zone.index);
    if (zone.kind === "none") {
      if (panel === "army") panel = "none";
      return;
    }
    if (panel !== "none") return;

    if (zone.kind === "wait") {
      stop();
      return act(() => playerWait(game));
    }
    if (zone.kind === "army") {
      panel = "army";
      return;
    }

    const h = hero(game);
    if (!h) return;

    const foe = unitAt(game, zone.x, zone.y);
    if (foe && foe.faction === "enemy" && visible(game, zone.x, zone.y)) {
      stop();
      flash(zone.x, zone.y, ORDER_KILL);
      setTarget(game, foe.id);
      engaging = ENGAGE_LIMIT;
      return;
    }

    const dx = zone.x - h.x;
    const dy = zone.y - h.y;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
      stop();
      flash(zone.x, zone.y, ORDER_MOVE);
      return act(() => playerStep(game, dx, dy));
    }

    const route = routeTo(game, zone.x, zone.y);
    // A refused order still answers, or a dead tap reads as a dead game
    if (!route.length) return flash(zone.x, zone.y, ORDER_DENIED);
    stop();
    setTarget(game, null);
    walk = route;
    goal = { x: zone.x, y: zone.y };
    flash(zone.x, zone.y, ORDER_MOVE);
  }

  function flash(x: number, y: number, color: string) {
    flashes.push({ x, y, color, until: performance.now() + FLASH_MS * 2 });
  }

  // Your army fights while you hold position; alone, you close on the mark yourself
  function stepEngage() {
    if (engaging <= 0) return;
    engaging -= 1;

    const mark = targetOf(game);
    const h = hero(game);
    if (!mark || !h || game.over || !visible(game, mark.x, mark.y)) {
      engaging = 0;
      return;
    }
    if (minionCount() > 0) return act(() => playerWait(game));

    const dx = mark.x - h.x;
    const dy = mark.y - h.y;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return act(() => playerStep(game, dx, dy));

    const route = routeTo(game, mark.x, mark.y);
    if (!route[0]) {
      engaging = 0;
      return;
    }
    act(() => playerStep(game, route[0].x - h.x, route[0].y - h.y));
  }

  const minionCount = () =>
    game.units.filter((u) => u.faction === "player" && u.creature !== "hero").length;

  function stepWalk() {
    const next = walk[0];
    if (!next || panel !== "none") return;
    const h = hero(game);
    if (!h) {
      walk = [];
      return;
    }
    walk = walk.slice(1);
    act(() => playerStep(game, next.x - h.x, next.y - h.y));
    if (!walk.length) goal = null;
    // Travel stops the moment something hostile is in view, as tap-to-move promised
    if (enemiesInView(game) > 0 || panel !== "none") stop();
  }

  const layout = () =>
    computeLayout({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      reserved: safe?.offsetHeight ?? 0,
    });

  $effect(() => {
    if (!host) return;
    if (!document.createElement("canvas").getContext("webgl2")) {
      host.textContent = "This browser has no WebGL2, which the tile renderer needs.";
      host.style.cssText = `color:${PALETTE[23]};font:14px/1.5 ui-monospace,monospace;padding:24px`;
      return;
    }

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

        const tap = (e: PointerEvent) => {
          const [x, y] = display.eventToPosition(e);
          if (x >= 0 && y >= 0) onTap(x, y);
        };
        canvas.addEventListener("pointerdown", tap);

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
        if (game.over) panel = "over";
        else if (game.unspent > 0) panel = "level";

        let last = performance.now();
        let since = 0;
        const loop = (now: number) => {
          // Re-armed first: one bad frame must not end the loop for good
          raf = requestAnimationFrame(loop);
          since += now - last;
          last = now;
          if (since >= STEP_MS) {
            since = 0;
            if (walk.length) stepWalk();
            else stepEngage();
          }
          if (flashes.length) flashes = flashes.filter((f) => f.until > now);
          const lit = new Map<string, string>();
          for (const f of flashes) lit.set(`${f.x},${f.y}`, f.color);
          render(display, game, cols, rows, { flash: lit, panel, goal });
        };
        let raf = requestAnimationFrame(loop);

        cleanup = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", resize);
          window.removeEventListener("orientationchange", resize);
          canvas.removeEventListener("pointerdown", tap);
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

<main>
  <div class="stage" bind:this={host}></div>
  <div class="safe" bind:this={safe}></div>
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
  }
  /* Measured, not assumed: keeps the button strip clear of the home indicator */
  .safe {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
