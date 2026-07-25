// Numbers and templates only - behaviour lives in game.ts
export type Point = { x: number; y: number };
export type Faction = "player" | "enemy";
export type AbilityId = "swarm" | "bulwark" | "wither" | "siphon" | "split";
export type CreatureId = "hero" | "rat" | "knight" | "moth" | "wisp" | "ossuary";
export type Stat = "might" | "ward" | "will";

export type Unit = {
  id: number;
  creature: CreatureId;
  faction: Faction;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  tier: number;
  withered: number;
};

export type Corpse = { creature: CreatureId; x: number; y: number; ttl: number };

export type GameState = {
  seed: number;
  rngState: unknown;
  turn: number;
  w: number;
  h: number;
  tiles: number[];
  explored: number[];
  vis: number[];
  units: Unit[];
  corpses: Corpse[];
  stairs: Point;
  nextId: number;
  xp: number;
  level: number;
  build: Record<Stat, number>;
  unspent: number;
  spawned: number;
  log: string[];
  over: "" | "dead" | "descended";
};

export const TUNING = {
  floorW: 60,
  floorH: 60,
  fovRadius: 8,
  corpseTtl: 20,
  enemiesPerFloor: 9,
  startingMinions: 2,
  spawnEvery: 25,
  spawnCap: 10,
  baseCap: 4,
  capPerLevel: 1,
  xpPerLevel: 24,
  logLines: 60,
  swarmPerAlly: 1,
  bulwarkCut: 0.5,
  witherCut: 0.5,
  witherTurns: 4,
  siphonHeal: 2,
  siphonRange: 4,
  splitThreshold: 5,
  splitTiers: 3,
  mightPerPoint: 1,
  wardPerPoint: 4,
  willPerPoint: 1,
};

export type Template = {
  name: string;
  glyph: string;
  color: number;
  hp: number;
  dmg: number;
  xp: number;
  ability: AbilityId | null;
};

export const CREATURES: Record<CreatureId, Template> = {
  hero: { name: "Necromancer", glyph: "🕱", color: 16, hp: 36, dmg: 4, xp: 0, ability: null },
  rat: { name: "Plague Rat", glyph: "⚇", color: 15, hp: 6, dmg: 2, xp: 6, ability: "swarm" },
  knight: { name: "Bone Knight", glyph: "⌤", color: 22, hp: 12, dmg: 2, xp: 12, ability: "bulwark" },
  moth: { name: "Grave Moth", glyph: "⫙", color: 20, hp: 8, dmg: 2, xp: 9, ability: "wither" },
  wisp: { name: "Corpse Wisp", glyph: "◉", color: 21, hp: 7, dmg: 1, xp: 9, ability: "siphon" },
  ossuary: { name: "Ossuary", glyph: "⚱", color: 17, hp: 42, dmg: 5, xp: 60, ability: "split" },
};

export const SPAWNABLE: CreatureId[] = ["rat", "rat", "knight", "moth", "wisp"];

export const STAT_LABEL: Record<Stat, string> = {
  might: "Might  +1 damage",
  ward: "Ward   +4 max HP",
  will: "Will   +1 command slot",
};
