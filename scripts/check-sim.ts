// Run: npm run check
import assert from "node:assert/strict";
import RNG from "rot-js/lib/rng.js";
import { CREATURES, TUNING, type GameState } from "../src/sim/data.ts";
import {
  attack,
  commandCap,
  corpseAt,
  drainHits,
  hero,
  isFloor,
  load,
  minions,
  newGame,
  playerStep,
  playerWait,
  routeTo,
  save,
  spawn,
} from "../src/sim/game.ts";
import { BTN_ROWS, HUD_ROWS, cameraFor, panelRect, render, zoneAt } from "../src/render.ts";

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

// An open arena, so mechanical tests do not depend on what the generator rolled
function sandbox(): GameState {
  const w = 12;
  const h = 12;
  const tiles = new Array<number>(w * h).fill(0);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) tiles[y * w + x] = 1;
  return {
    seed: 1,
    rngState: null,
    turn: 0,
    w,
    h,
    tiles,
    explored: new Array<number>(w * h).fill(1),
    vis: new Array<number>(w * h).fill(1),
    units: [],
    corpses: [],
    chests: [],
    stairs: { x: 10, y: 10 },
    nextId: 1,
    xp: 0,
    level: 0,
    build: { might: 0, ward: 0, will: 0 },
    unspent: 0,
    spawned: 0,
    log: [],
    over: "",
  };
}

test("floor generation is deterministic per seed", () => {
  assert.equal(JSON.stringify(newGame(1234)), JSON.stringify(newGame(1234)));
  assert.notEqual(JSON.stringify(newGame(1)), JSON.stringify(newGame(2)));
});

test("generated floor is coherent", () => {
  const g = newGame(99);
  const h = hero(g);
  assert.ok(h, "hero missing");
  assert.ok(isFloor(g, h.x, h.y), "hero spawned in rock");
  assert.ok(isFloor(g, g.stairs.x, g.stairs.y), "stairs in rock");
  assert.equal(g.units.filter((u) => u.creature === "ossuary").length, 1, "boss count");
  for (const u of g.units) assert.ok(isFloor(g, u.x, u.y), `${u.creature} in rock`);
});

test("the outer wall stays solid and the floor is one connected space", () => {
  for (const seed of [11, 22, 33]) {
    const g = newGame(seed);
    for (let x = 0; x < g.w; x++) {
      assert.ok(!isFloor(g, x, 0) && !isFloor(g, x, g.h - 1), `seed ${seed}: floor on the top or bottom edge`);
    }
    for (let y = 0; y < g.h; y++) {
      assert.ok(!isFloor(g, 0, y) && !isFloor(g, g.w - 1, y), `seed ${seed}: floor on the left or right edge`);
    }

    const h = hero(g)!;
    const seen = new Set<number>([h.y * g.w + h.x]);
    const queue = [{ x: h.x, y: h.y }];
    while (queue.length) {
      const p = queue.pop()!;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const x = p.x + dx;
        const y = p.y + dy;
        const k = y * g.w + x;
        if (!isFloor(g, x, y) || seen.has(k)) continue;
        seen.add(k);
        queue.push({ x, y });
      }
    }

    assert.ok(seen.has(g.stairs.y * g.w + g.stairs.x), `seed ${seed}: the stair is walled off`);
    for (const u of g.units) {
      assert.ok(seen.has(u.y * g.w + u.x), `seed ${seed}: ${u.creature} is sealed away from the hero`);
    }
    for (const c of g.chests) {
      assert.ok(seen.has(c.y * g.w + c.x), `seed ${seed}: a chest is unreachable`);
    }
  }
});

test("corridors are wide enough for a column to pass", () => {
  for (const seed of [11, 22, 33]) {
    const g = newGame(seed);
    let floor = 0;
    let pinch = 0;
    for (let y = 1; y < g.h - 1; y++) {
      for (let x = 1; x < g.w - 1; x++) {
        if (!isFloor(g, x, y)) continue;
        floor++;
        const n = isFloor(g, x, y - 1);
        const s = isFloor(g, x, y + 1);
        const e = isFloor(g, x + 1, y);
        const w = isFloor(g, x - 1, y);
        if ((!n && !s) || (!e && !w)) pinch++;
      }
    }
    // raw Digger output sits around 27-43%; widening should leave only ends and corners
    assert.ok(pinch / floor < 0.12, `seed ${seed}: ${((pinch / floor) * 100).toFixed(0)}% of floor is single file`);
  }
});

test("a chest pays out once and is gone", () => {
  RNG.setSeed(5);
  const g = sandbox();
  const h = spawn(g, "hero", "player", 5, 5);
  h.hp = 10;
  g.chests.push({ x: 6, y: 5 });

  const before = { hp: h.hp, xp: g.xp, level: g.level, corpses: g.corpses.length };
  playerStep(g, 1, 0);

  assert.equal(g.chests.length, 0, "chest survived being opened");
  const paid =
    h.hp > before.hp ||
    g.xp !== before.xp ||
    g.level > before.level ||
    g.corpses.length > before.corpses;
  assert.ok(paid, "chest paid out nothing at all");

  playerStep(g, -1, 0);
  playerStep(g, 1, 0);
  assert.equal(g.chests.length, 0, "a chest was reopened");
});

test("raising is deterministic and bounded by the command cap", () => {
  const g = sandbox();
  spawn(g, "hero", "player", 5, 5);
  g.corpses.push({ creature: "rat", x: 6, y: 5, ttl: TUNING.corpseTtl });

  assert.equal(minions(g).length, 0);
  playerStep(g, 1, 0);
  assert.equal(minions(g).length, 1, "corpse on a free slot must raise every time");
  assert.equal(corpseAt(g, 6, 5), undefined, "corpse consumed");

  while (minions(g).length < commandCap(g)) spawn(g, "rat", "player", 2, 2 + minions(g).length);
  const full = minions(g).length;
  g.corpses.push({ creature: "rat", x: 7, y: 5, ttl: TUNING.corpseTtl });
  playerStep(g, 1, 0);
  assert.equal(minions(g).length, full, "raising past the cap must be refused");
  assert.ok(corpseAt(g, 7, 5), "refused corpse must stay on the floor");
});

test("corpses rot after the tuned window", () => {
  const g = sandbox();
  spawn(g, "hero", "player", 2, 2);
  g.corpses.push({ creature: "knight", x: 9, y: 9, ttl: TUNING.corpseTtl });

  for (let i = 0; i < TUNING.corpseTtl - 1; i++) playerWait(g);
  assert.ok(corpseAt(g, 9, 9), "corpse rotted early");
  playerWait(g);
  assert.equal(corpseAt(g, 9, 9), undefined, "corpse outlived its window");
});

test("the undead crumble and leave nothing to raise", () => {
  const g = sandbox();
  spawn(g, "hero", "player", 1, 1);
  const skeleton = spawn(g, "rat", "player", 5, 5);
  const foe = spawn(g, "ossuary", "enemy", 6, 5);

  skeleton.hp = 1;
  attack(g, foe, skeleton);
  assert.equal(g.units.some((u) => u.id === skeleton.id), false, "minion survived");
  assert.equal(corpseAt(g, 5, 5), undefined, "a raised minion must not leave a body");
});

test("living enemies do leave a body", () => {
  const g = sandbox();
  const h = spawn(g, "hero", "player", 5, 5);
  const foe = spawn(g, "rat", "enemy", 6, 5);
  foe.hp = 1;
  attack(g, h, foe);
  assert.ok(corpseAt(g, 6, 5), "enemy left no corpse");
});

test("the Ossuary splits when struck hard, and stops at the last tier", () => {
  const g = sandbox();
  const h = spawn(g, "hero", "player", 5, 5);
  g.build.might = 2;
  const dmg = CREATURES.hero.dmg + g.build.might * TUNING.mightPerPoint;
  assert.ok(dmg >= TUNING.splitThreshold, "test needs a hit above the split threshold");

  const boss = spawn(g, "ossuary", "enemy", 6, 5);
  attack(g, h, boss);
  assert.equal(g.units.filter((u) => u.creature === "ossuary").length, 2, "boss did not split");

  for (const u of g.units) if (u.creature === "ossuary") u.tier = TUNING.splitTiers - 1;
  attack(g, h, boss);
  assert.equal(
    g.units.filter((u) => u.creature === "ossuary").length,
    2,
    "last tier must not keep splitting",
  );
});

test("a light hit does not split the Ossuary", () => {
  const g = sandbox();
  const h = spawn(g, "hero", "player", 5, 5);
  const boss = spawn(g, "ossuary", "enemy", 6, 5);
  assert.ok(CREATURES.hero.dmg < TUNING.splitThreshold, "test needs a hit below the threshold");
  attack(g, h, boss);
  assert.equal(g.units.filter((u) => u.creature === "ossuary").length, 1);
});

test("the stair stays shut while the boss lives", () => {
  const g = sandbox();
  spawn(g, "hero", "player", 9, 10);
  const boss = spawn(g, "ossuary", "enemy", 1, 1);
  playerStep(g, 1, 0);
  assert.equal(g.over, "", "descended past a living boss");

  g.units = g.units.filter((u) => u.id !== boss.id);
  playerStep(g, -1, 0);
  playerStep(g, 1, 0);
  assert.equal(g.over, "descended", "stair stayed shut after the boss died");
});

test("a save round-trips through storage with its RNG state", () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };

  const g = newGame(77);
  playerWait(g);
  save(g);

  const back = load();
  assert.ok(back, "save did not come back");
  assert.equal(JSON.stringify(back), JSON.stringify(g), "state changed across the round trip");

  // Same RNG state means the next roll matches, so raise chances cannot be re-rolled by reloading
  RNG.setState(g.rngState);
  const expected = RNG.getUniform();
  RNG.setState(back.rngState);
  assert.equal(RNG.getUniform(), expected, "reloading re-rolled the RNG");
});

test("minions keep up with a walking hero", () => {
  const g = sandbox();
  const h = spawn(g, "hero", "player", 2, 5);
  spawn(g, "rat", "player", 1, 5);
  spawn(g, "rat", "player", 1, 6);

  for (let i = 0; i < 7; i++) playerStep(g, 1, 0);
  assert.equal(h.x, 9, "hero did not walk");

  for (const m of minions(g)) {
    const gap = Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y));
    assert.ok(gap <= 3, `${m.creature} trailed ${gap} tiles behind`);
  }
});

test("a seen enemy closes on the hero", () => {
  const g = sandbox();
  const h = spawn(g, "hero", "player", 2, 5);
  const foe = spawn(g, "rat", "enemy", 9, 5);
  const before = Math.abs(foe.x - h.x);

  playerWait(g);
  playerWait(g);
  assert.ok(Math.abs(foe.x - h.x) < before, "enemy never moved toward the hero");
});

test("every landed blow reports a hit for the view to flash", () => {
  const g = sandbox();
  const h = spawn(g, "hero", "player", 5, 5);
  const foe = spawn(g, "rat", "enemy", 6, 5);
  drainHits();

  attack(g, h, foe);
  const first = drainHits();
  assert.equal(first.length, 1, "a blow reported no hit");
  assert.deepEqual({ x: first[0].x, y: first[0].y }, { x: 6, y: 5 }, "hit reported at the wrong tile");
  assert.equal(first[0].faction, "enemy");
  assert.equal(first[0].fatal, false);

  foe.hp = 1;
  attack(g, h, foe);
  const second = drainHits();
  assert.equal(second[0].fatal, true, "a killing blow was not marked fatal");
  assert.equal(drainHits().length, 0, "hits were not drained");
});

test("travel refuses to route into unexplored ground", () => {
  const g = newGame(2026);
  const h = hero(g)!;

  const dark = [];
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (isFloor(g, x, y) && g.explored[y * g.w + x] === 0) dark.push({ x, y });
  assert.ok(dark.length > 0, "the whole floor started explored");

  assert.equal(routeTo(g, dark[0].x, dark[0].y).length, 0, "routed to a tile never seen");

  const lit = [];
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (isFloor(g, x, y) && g.explored[y * g.w + x] === 1) lit.push({ x, y });
  const far = lit.sort(
    (a, b) =>
      Math.max(Math.abs(b.x - h.x), Math.abs(b.y - h.y)) -
      Math.max(Math.abs(a.x - h.x), Math.abs(a.y - h.y)),
  )[0];
  const path = routeTo(g, far.x, far.y);
  assert.ok(path.length > 0, "could not route across explored ground");
  for (const p of path) assert.equal(g.explored[p.y * g.w + p.x], 1, "path crossed unseen ground");
});

test("a flashed tile is drawn inverted so a blow is visible", () => {
  const g = sandbox();
  spawn(g, "hero", "player", 5, 5);
  spawn(g, "rat", "enemy", 6, 5);

  const drawn: { x: number; y: number; ch: string; fg: string; bg: string }[] = [];
  const stub = {
    clear() {},
    drawText() {},
    draw: (x: number, y: number, ch: string, fg: string, bg: string) =>
      drawn.push({ x, y, ch, fg, bg }),
  };

  render(stub as never, g, 12, 12, new Map());
  const plain = drawn.filter((d) => d.ch === CREATURES.rat.glyph).pop();
  assert.ok(plain, "enemy was not drawn at all");

  drawn.length = 0;
  render(stub as never, g, 12, 12, new Map([["6,5", "#ffe077"]]));
  const lit = drawn.filter((d) => d.ch === CREATURES.rat.glyph).pop();
  assert.ok(lit, "enemy vanished when flashed");
  assert.equal(lit.bg, "#ffe077", "flashed tile kept its normal background");
  assert.notEqual(lit.bg, plain.bg, "flash made no visible difference");
});

test("taps land on what was drawn", () => {
  const g = sandbox();
  spawn(g, "hero", "player", 5, 5);
  const cols = 16;
  const rows = 20;

  const left = zoneAt(g, "none", cols, rows, 2, rows - 1);
  const right = zoneAt(g, "none", cols, rows, cols - 2, rows - BTN_ROWS);
  assert.equal(left.kind, "wait", "left of the strip is not WAIT");
  assert.equal(right.kind, "army", "right of the strip is not ARMY");

  // both button rows must answer, or the 48px target is a lie
  assert.equal(zoneAt(g, "none", cols, rows, 2, rows - BTN_ROWS).kind, "wait");

  const cam = cameraFor(g, cols, rows);
  const onMap = zoneAt(g, "none", cols, rows, 3, 4);
  assert.equal(onMap.kind, "map");
  assert.deepEqual(
    { x: onMap.kind === "map" ? onMap.x : -1, y: onMap.kind === "map" ? onMap.y : -1 },
    { x: 3 + cam.x, y: 4 + cam.y },
    "map tap resolved to the wrong world tile",
  );

  // the status and log rows are dead space, not the map
  assert.equal(zoneAt(g, "none", cols, rows, 3, rows - HUD_ROWS).kind, "none");

  g.unspent = 1;
  const r = panelRect(g, "level", cols, rows);
  const first = zoneAt(g, "level", cols, rows, r.x + 1, r.y + 2);
  const third = zoneAt(g, "level", cols, rows, r.x + 1, r.y + 4);
  assert.deepEqual(first, { kind: "line", index: 0 }, "first choice mis-hit");
  assert.deepEqual(third, { kind: "line", index: 2 }, "third choice mis-hit");
  assert.equal(zoneAt(g, "level", cols, rows, r.x + 1, r.y).kind, "none", "title row is not a choice");
  assert.equal(zoneAt(g, "level", cols, rows, 0, 0).kind, "none", "tap outside the panel hit a line");
});

test("a scripted run survives 300 turns with its invariants intact", () => {
  const g = newGame(4242);
  let acted = 0;

  for (let i = 0; i < 300 && !g.over; i++) {
    const h = hero(g);
    if (!h) break;

    const foe = g.units
      .filter((u) => u.faction === "enemy")
      .sort(
        (a, b) =>
          Math.max(Math.abs(a.x - h.x), Math.abs(a.y - h.y)) -
          Math.max(Math.abs(b.x - h.x), Math.abs(b.y - h.y)),
      )[0];

    const path = foe ? routeTo(g, foe.x, foe.y) : [];
    if (path[0]) playerStep(g, path[0].x - h.x, path[0].y - h.y);
    else playerWait(g);
    acted++;

    const seen = new Set<string>();
    for (const u of g.units) {
      assert.ok(isFloor(g, u.x, u.y), `turn ${g.turn}: ${u.creature} stood in rock`);
      assert.ok(u.hp > 0, `turn ${g.turn}: ${u.creature} lived at ${u.hp} hp`);
      const key = `${u.x},${u.y}`;
      assert.equal(seen.has(key), false, `turn ${g.turn}: two units share ${key}`);
      seen.add(key);
    }
    for (const c of g.corpses) assert.ok(c.ttl > 0, "a rotted corpse was left on the floor");
  }

  assert.ok(acted > 0, "the run never acted");
  assert.ok(g.turn > 0, "the clock never advanced");
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} sim checks passed`);
if (failed) process.exit(1);
