import RNG from "rot-js/lib/rng.js";
import Digger from "rot-js/lib/map/digger.js";
import PreciseShadowcasting from "rot-js/lib/fov/precise-shadowcasting.js";
import AStar from "rot-js/lib/path/astar.js";
import {
  CREATURES,
  SPAWNABLE,
  TUNING,
  type AbilityId,
  type CreatureId,
  type GameState,
  type Point,
  type Stat,
  type Unit,
} from "./data.ts";

const DIRS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export const idx = (g: GameState, x: number, y: number) => y * g.w + x;
export const inBounds = (g: GameState, x: number, y: number) =>
  x >= 0 && y >= 0 && x < g.w && y < g.h;
export const isFloor = (g: GameState, x: number, y: number) =>
  inBounds(g, x, y) && g.tiles[idx(g, x, y)] === 1;
export const unitAt = (g: GameState, x: number, y: number) =>
  g.units.find((u) => u.x === x && u.y === y);
export const corpseAt = (g: GameState, x: number, y: number) =>
  g.corpses.find((c) => c.x === x && c.y === y);
export const hero = (g: GameState) => g.units.find((u) => u.creature === "hero");
export const minions = (g: GameState) =>
  g.units.filter((u) => u.faction === "player" && u.creature !== "hero");
export const commandCap = (g: GameState) =>
  TUNING.baseCap + g.level * TUNING.capPerLevel + g.build.will * TUNING.willPerPoint;

const cheb = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const walkable = (g: GameState, x: number, y: number) => isFloor(g, x, y) && !unitAt(g, x, y);

function log(g: GameState, line: string) {
  g.log.push(line);
  if (g.log.length > TUNING.logLines) g.log.shift();
}

// --- abilities: one function per hook, every number comes from TUNING ---

type Hooks = {
  onTurn?: (self: Unit, g: GameState) => void;
  onAttack?: (self: Unit, target: Unit, g: GameState) => void;
  onDamaged?: (self: Unit, amount: number, g: GameState) => void;
  damageBonus?: (self: Unit, target: Unit, g: GameState) => number;
};

export const ABILITIES: Record<AbilityId, Hooks> = {
  swarm: {
    damageBonus: (self, target, g) =>
      g.units.filter((u) => u.faction === self.faction && cheb(u, target) === 1).length *
      TUNING.swarmPerAlly,
  },

  bulwark: {},

  wither: {
    onAttack: (_self, target) => {
      target.withered = TUNING.witherTurns;
    },
  },

  siphon: {
    onTurn: (self, g) => {
      const hurt = g.units
        .filter((u) => u.faction === self.faction && u.hp < u.maxHp && cheb(u, self) <= TUNING.siphonRange)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (!hurt) return;
      hurt.hp = Math.min(hurt.maxHp, hurt.hp + TUNING.siphonHeal);
    },
  },

  split: {
    onDamaged: (self, amount, g) => {
      if (amount < TUNING.splitThreshold) return;
      if (self.tier >= TUNING.splitTiers - 1 || self.hp <= 1) return;
      const spot = DIRS.map(([dx, dy]) => ({ x: self.x + dx, y: self.y + dy })).find((p) =>
        walkable(g, p.x, p.y),
      );
      if (!spot) return;
      const half = Math.floor(self.hp / 2);
      self.hp -= half;
      self.tier += 1;
      const shard = spawn(g, "ossuary", "enemy", spot.x, spot.y);
      shard.tier = self.tier;
      shard.hp = half;
      shard.maxHp = self.maxHp;
      log(g, "The Ossuary splits.");
    },
  },
};

const hooksOf = (u: Unit): Hooks => {
  const a = CREATURES[u.creature].ability;
  return a ? ABILITIES[a] : {};
};

// Bulwark is a passive on neighbours, so it is read from the field rather than the owner
const bulwarked = (g: GameState, u: Unit) =>
  g.units.some(
    (o) => o.faction === u.faction && o.id !== u.id && cheb(o, u) === 1 && CREATURES[o.creature].ability === "bulwark",
  );

// --- construction ---

export function spawn(
  g: GameState,
  creature: CreatureId,
  faction: "player" | "enemy",
  x: number,
  y: number,
): Unit {
  const t = CREATURES[creature];
  const u: Unit = {
    id: g.nextId++,
    creature,
    faction,
    x,
    y,
    hp: t.hp,
    maxHp: t.hp,
    tier: 0,
    withered: 0,
  };
  g.units.push(u);
  return u;
}

export function newGame(seed: number): GameState {
  RNG.setSeed(seed);

  const w = TUNING.floorW;
  const h = TUNING.floorH;
  const tiles = new Array<number>(w * h).fill(0);
  const digger = new Digger(w, h);
  digger.create((x, y, wall) => {
    tiles[y * w + x] = wall ? 0 : 1;
  });

  const rooms = digger.getRooms();
  const centers = rooms.map((r) => {
    const [x, y] = r.getCenter();
    return { x, y };
  });

  const start = centers[0];
  let far = centers[0];
  for (const c of centers) if (cheb(c, start) > cheb(far, start)) far = c;

  const g: GameState = {
    seed,
    rngState: RNG.getState(),
    turn: 0,
    w,
    h,
    tiles,
    explored: new Array<number>(w * h).fill(0),
    vis: new Array<number>(w * h).fill(0),
    units: [],
    corpses: [],
    stairs: far,
    nextId: 1,
    xp: 0,
    level: 0,
    build: { might: 0, ward: 0, will: 0 },
    unspent: 0,
    spawned: 0,
    log: [],
    over: "",
  };

  spawn(g, "hero", "player", start.x, start.y);

  // The boss guards the stairs; everything else is scattered through the other rooms
  const boss = freeNear(g, far.x, far.y) ?? far;
  spawn(g, "ossuary", "enemy", boss.x, boss.y);

  // A fixed population, scattered over the rooms between you and the stair
  const open = centers.filter((c) => c !== start && c !== far);
  for (let i = 0; i < TUNING.enemiesPerFloor && open.length; i++) {
    const room = open[Math.floor(RNG.getUniform() * open.length)];
    const spot = freeNear(g, room.x, room.y);
    if (spot) spawn(g, pick(SPAWNABLE), "enemy", spot.x, spot.y);
  }

  // You arrive with a small retinue, so the army reads as the point from turn one
  for (let i = 0; i < TUNING.startingMinions; i++) {
    const spot = freeNear(g, start.x, start.y);
    if (spot) spawn(g, "rat", "player", spot.x, spot.y);
  }

  computeFov(g);
  log(g, "You enter the crypt.");
  return g;
}

const pick = <T>(list: T[]): T => list[Math.floor(RNG.getUniform() * list.length)];

function freeNear(g: GameState, cx: number, cy: number): Point | undefined {
  for (let r = 0; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (walkable(g, x, y)) return { x, y };
      }
    }
  }
  return undefined;
}

// --- vision ---

export function computeFov(g: GameState) {
  g.vis.fill(0);
  const h = hero(g);
  if (!h) return;
  const fov = new PreciseShadowcasting((x, y) => isFloor(g, x, y));
  fov.compute(h.x, h.y, TUNING.fovRadius, (x, y) => {
    if (!inBounds(g, x, y)) return;
    g.vis[idx(g, x, y)] = 1;
    g.explored[idx(g, x, y)] = 1;
  });
}

export const visible = (g: GameState, x: number, y: number) =>
  inBounds(g, x, y) && g.vis[idx(g, x, y)] === 1;

export const explored = (g: GameState, x: number, y: number) =>
  inBounds(g, x, y) && g.explored[idx(g, x, y)] === 1;

// --- combat ---

export function attack(g: GameState, attacker: Unit, target: Unit) {
  const bonus = hooksOf(attacker).damageBonus?.(attacker, target, g) ?? 0;
  let dmg = CREATURES[attacker.creature].dmg + bonus;
  if (attacker.creature === "hero") dmg += g.build.might * TUNING.mightPerPoint;
  if (attacker.withered > 0) dmg = Math.max(1, Math.round(dmg * TUNING.witherCut));
  if (bulwarked(g, target)) dmg = Math.max(1, Math.round(dmg * TUNING.bulwarkCut));

  hooksOf(attacker).onAttack?.(attacker, target, g);
  target.hp -= dmg;

  if (target.hp > 0) {
    hooksOf(target).onDamaged?.(target, dmg, g);
    return;
  }
  kill(g, target, attacker);
}

function kill(g: GameState, target: Unit, killer: Unit) {
  g.units = g.units.filter((u) => u.id !== target.id);

  // Decision 5b: the undead crumble, so only living enemies leave a body
  if (target.faction === "enemy") {
    g.corpses.push({
      creature: target.creature,
      x: target.x,
      y: target.y,
      ttl: TUNING.corpseTtl,
    });
  }

  if (killer.faction === "player" && target.faction === "enemy") {
    g.xp += CREATURES[target.creature].xp;
    while (g.xp >= TUNING.xpPerLevel * (g.level + 1)) {
      g.xp -= TUNING.xpPerLevel * (g.level + 1);
      g.level += 1;
      g.unspent += 1;
      log(g, `You reach level ${g.level + 1}.`);
    }
  }

  log(g, `${CREATURES[target.creature].name} falls.`);
  if (target.creature === "hero") g.over = "dead";
}

export function chooseStat(g: GameState, stat: Stat) {
  if (g.unspent <= 0) return;
  g.unspent -= 1;
  g.build[stat] += 1;
  const h = hero(g);
  if (h && stat === "ward") {
    h.maxHp += TUNING.wardPerPoint;
    h.hp += TUNING.wardPerPoint;
  }
}

// --- movement ---

function step(g: GameState, u: Unit, toward: Point) {
  const path: Point[] = [];
  const astar = new AStar(toward.x, toward.y, (x, y) => isFloor(g, x, y) && (!unitAt(g, x, y) || (x === toward.x && y === toward.y)), {
    topology: 8,
  });
  astar.compute(u.x, u.y, (x, y) => path.push({ x, y }));
  const next = path[1];
  if (!next) return false;

  const blocker = unitAt(g, next.x, next.y);
  if (blocker) {
    if (blocker.faction !== u.faction) attack(g, u, blocker);
    return true;
  }
  u.x = next.x;
  u.y = next.y;
  return true;
}

// Awareness needs line of sight as well as range, or every foe on the floor converges at once
function nearestEnemy(g: GameState, u: Unit, range: number) {
  return g.units
    .filter((o) => o.faction !== u.faction && cheb(o, u) <= range && visible(g, o.x, o.y))
    .sort((a, b) => cheb(a, u) - cheb(b, u))[0];
}

// --- turn loop: one shared clock, everyone acts once per turn ---
// ponytail: no speed differences yet; swap in ROT.Scheduler.Speed if pacing needs them

function actUnit(g: GameState, u: Unit) {
  if (g.over) return;
  hooksOf(u).onTurn?.(u, g);
  if (u.withered > 0) u.withered -= 1;

  const foe = nearestEnemy(g, u, TUNING.fovRadius);
  if (foe && cheb(foe, u) === 1) {
    attack(g, u, foe);
    return;
  }
  if (foe) {
    step(g, u, foe);
    return;
  }
  if (u.faction === "player") {
    const h = hero(g);
    if (h && cheb(h, u) > 2) step(g, u, h);
  }
}

function decay(g: GameState) {
  for (const c of g.corpses) c.ttl -= 1;
  const rotted = g.corpses.filter((c) => c.ttl <= 0);
  g.corpses = g.corpses.filter((c) => c.ttl > 0);
  if (rotted.length) log(g, `${rotted.length} corpse${rotted.length > 1 ? "s" : ""} rots away.`);
}

function spawnPressure(g: GameState) {
  if (g.turn % TUNING.spawnEvery !== 0) return;
  if (g.spawned >= TUNING.spawnCap) return;
  const h = hero(g);
  if (!h) return;
  for (let tries = 0; tries < 80; tries++) {
    const x = Math.floor(RNG.getUniform() * g.w);
    const y = Math.floor(RNG.getUniform() * g.h);
    if (!walkable(g, x, y) || cheb(h, { x, y }) <= TUNING.fovRadius + 2) continue;
    spawn(g, pick(SPAWNABLE), "enemy", x, y);
    g.spawned += 1;
    log(g, "Something stirs in the dark.");
    return;
  }
}

function endTurn(g: GameState) {
  for (const u of [...g.units]) {
    if (u.creature === "hero") continue;
    if (!g.units.some((o) => o.id === u.id)) continue;
    actUnit(g, u);
  }
  g.turn += 1;
  decay(g);
  spawnPressure(g);
  computeFov(g);
  g.rngState = RNG.getState();
}

// --- player actions, each of which consumes the turn ---

function tryRaise(g: GameState, x: number, y: number) {
  const corpse = corpseAt(g, x, y);
  if (!corpse) return;
  if (minions(g).length >= commandCap(g)) {
    log(g, "No command to spare.");
    return;
  }
  g.corpses = g.corpses.filter((c) => c !== corpse);
  const spot = freeNear(g, x, y);
  if (!spot) return;
  spawn(g, corpse.creature, "player", spot.x, spot.y);
  log(g, `Raised ${CREATURES[corpse.creature].name}.`);
}

export function playerStep(g: GameState, dx: number, dy: number) {
  if (g.over) return;
  const h = hero(g);
  if (!h) return;
  const x = h.x + dx;
  const y = h.y + dy;
  if (!isFloor(g, x, y)) return;

  const blocker = unitAt(g, x, y);
  if (blocker && blocker.faction === "enemy") {
    attack(g, h, blocker);
    endTurn(g);
    return;
  }
  if (blocker) return;

  h.x = x;
  h.y = y;
  tryRaise(g, x, y);

  if (x === g.stairs.x && y === g.stairs.y) {
    const bossAlive = g.units.some((u) => u.creature === "ossuary");
    if (bossAlive) log(g, "The Ossuary bars the stair.");
    else g.over = "descended";
  }
  endTurn(g);
}

export function playerWait(g: GameState) {
  if (g.over) return;
  endTurn(g);
}

// Travel only crosses ground you have actually seen, so tapping into the dark reveals nothing
export function routeTo(g: GameState, tx: number, ty: number): Point[] {
  const h = hero(g);
  if (!h || !isFloor(g, tx, ty) || !explored(g, tx, ty)) return [];
  const path: Point[] = [];
  const passable = (x: number, y: number) =>
    isFloor(g, x, y) &&
    explored(g, x, y) &&
    (!unitAt(g, x, y) || (x === tx && y === ty) || (x === h.x && y === h.y));
  const astar = new AStar(tx, ty, passable, {
    topology: 8,
  });
  astar.compute(h.x, h.y, (x, y) => path.push({ x, y }));
  return path.slice(1);
}

// Line of sight, not distance: a foe behind a wall must not interrupt travel
export function enemiesInView(g: GameState) {
  return g.units.filter((u) => u.faction === "enemy" && visible(g, u.x, u.y)).length;
}

// --- persistence: decision 12, whole state including RNG, every turn ---

const KEY = "necromancer.save";

export function save(g: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    // a full or blocked store must not take the run down with it
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as GameState;
    RNG.setState(g.rngState);
    return g;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do if the store is unavailable
  }
}
