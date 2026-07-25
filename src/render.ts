import type Display from "rot-js/lib/display/display.js";
import { CREATURES, STAT_LABEL, type GameState, type Point } from "./sim/data.ts";
import {
  chestAt,
  targetOf,
  commandCap,
  corpseAt,
  explored,
  hero,
  minions,
  unitAt,
  visible,
} from "./sim/game.ts";
import { PALETTE } from "./tilemap.ts";

const WALL = "▓";
const FLOOR_CH = ".";
const CORPSE = "%";
const STAIR = ">";
const CHEST = "⩀";

const INK = PALETTE[23];
const DARK = PALETTE[2];
const LIT_WALL = PALETTE[10];
const LIT_FLOOR = PALETTE[9];
const DIM_WALL = PALETTE[6];
const DIM_FLOOR = PALETTE[5];
const CORPSE_COL = PALETTE[14];
const STAIR_COL = PALETTE[22];
const DIM = PALETTE[9];
const BTN = PALETTE[6];
const BTN_ALT = PALETTE[10];
const GOLD = PALETTE[16];
const MARK = PALETTE[14];

// log, status, then a two-row button strip so a thumb has ~48px to land on
export const HUD_ROWS = 4;
export const BTN_ROWS = 2;

export type Panel = "none" | "menu" | "level" | "over" | "confirm";
export type Action = "close" | "restart" | "confirm" | "might" | "ward" | "will";
export type PanelLine = { text: string; action: Action | null };
export type Zone =
  | { kind: "map"; x: number; y: number }
  | { kind: "wait" }
  | { kind: "menu" }
  | { kind: "line"; index: number }
  | { kind: "none" };

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const viewRows = (rows: number) => rows - HUD_ROWS;

export function cameraFor(g: GameState, cols: number, rows: number): Point {
  const h = hero(g);
  const view = viewRows(rows);
  if (!h) return { x: 0, y: 0 };
  return {
    x: clamp(h.x - (cols >> 1), 0, Math.max(0, g.w - cols)),
    y: clamp(h.y - (view >> 1), 0, Math.max(0, g.h - view)),
  };
}

// Text and what it does live together, so a line cannot mean one thing and do another
export function panelLines(g: GameState, panel: Panel): { title: string; lines: PanelLine[] } {
  if (panel === "menu") {
    const roster = minions(g).map((u) => ({
      text: `${CREATURES[u.creature].short} ${u.hp}/${u.maxHp}`,
      action: null,
    }));
    return {
      title: `ARMY ${minions(g).length}/${commandCap(g)}`,
      lines: [
        ...(roster.length ? roster : [{ text: "nothing raised", action: null }]),
        { text: "", action: null },
        { text: "restart run", action: "restart" as const },
        { text: "close", action: "close" as const },
      ],
    };
  }
  if (panel === "confirm") {
    return {
      title: "RESTART?",
      lines: [
        { text: "this run is lost", action: null },
        { text: "yes, restart", action: "confirm" },
        { text: "no, keep going", action: "close" },
      ],
    };
  }
  if (panel === "level") {
    return {
      title: `LEVEL ${g.level + 1}`,
      lines: [
        { text: STAT_LABEL.might, action: "might" },
        { text: STAT_LABEL.ward, action: "ward" },
        { text: STAT_LABEL.will, action: "will" },
      ],
    };
  }
  return {
    title: g.over === "dead" ? "YOU FELL" : "YOU DESCEND",
    lines: [
      { text: g.over === "dead" ? "the army crumbles" : "no floor 2 yet", action: null },
      { text: "new run", action: "confirm" },
    ],
  };
}

export function panelRect(g: GameState, panel: Panel, cols: number, rows: number) {
  const { title, lines } = panelLines(g, panel);
  const width = Math.min(cols, Math.max(title.length, ...lines.map((l) => l.text.length)) + 4);
  const height = lines.length + 3;
  return {
    x: Math.max(0, (cols - width) >> 1),
    y: Math.max(0, (viewRows(rows) - height) >> 1),
    w: width,
    h: height,
  };
}

// The one place a tap becomes meaning, so hit areas cannot drift from what was drawn
export function zoneAt(
  g: GameState,
  panel: Panel,
  cols: number,
  rows: number,
  sx: number,
  sy: number,
): Zone {
  if (panel !== "none") {
    const r = panelRect(g, panel, cols, rows);
    const index = sy - r.y - 2;
    const within =
      sx >= r.x && sx < r.x + r.w && index >= 0 && index < panelLines(g, panel).lines.length;
    return within ? { kind: "line", index } : { kind: "none" };
  }
  if (sy >= rows - BTN_ROWS) return sx < cols >> 1 ? { kind: "wait" } : { kind: "menu" };
  if (sy >= viewRows(rows)) return { kind: "none" };
  const cam = cameraFor(g, cols, rows);
  return { kind: "map", x: sx + cam.x, y: sy + cam.y };
}

export type View = {
  flash: Map<string, string>;
  panel: Panel;
};

export function render(d: Display, g: GameState, cols: number, rows: number, view: View) {
  const { flash, panel } = view;
  const mark = targetOf(g);
  const cam = cameraFor(g, cols, rows);
  const height = viewRows(rows);
  d.clear();

  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < cols; sx++) {
      const x = sx + cam.x;
      const y = sy + cam.y;
      if (!explored(g, x, y)) continue;

      const lit = visible(g, x, y);
      const wall = g.tiles[y * g.w + x] !== 1;
      let ch = wall ? WALL : FLOOR_CH;
      let fg = wall ? (lit ? LIT_WALL : DIM_WALL) : lit ? LIT_FLOOR : DIM_FLOOR;

      if (!wall && g.stairs.x === x && g.stairs.y === y) {
        ch = STAIR;
        fg = lit ? STAIR_COL : DIM_WALL;
      }

      // Chests are remembered once seen, so you can come back for one you walked past
      if (chestAt(g, x, y)) {
        ch = CHEST;
        fg = lit ? GOLD : DIM_WALL;
      }

      // Remembered terrain shows, but only what is currently lit shows its occupants
      if (lit) {
        const corpse = corpseAt(g, x, y);
        if (corpse) {
          ch = CORPSE;
          fg = CORPSE_COL;
        }
        const unit = unitAt(g, x, y);
        if (unit) {
          const t = CREATURES[unit.creature];
          ch = t.glyph;
          fg = unit.faction === "player" && unit.creature !== "hero" ? INK : PALETTE[t.color];
        }
      }

      const hit = flash.get(`${x},${y}`);
      if (hit) d.draw(sx, sy, ch, DARK, hit);
      else if (lit && mark && mark.x === x && mark.y === y) d.draw(sx, sy, ch, INK, MARK);
      else d.draw(sx, sy, ch, fg, DARK);
    }
  }

  drawHud(d, g, cols, rows);
  if (panel !== "none") drawPanel(d, g, panel, cols, rows);
}

function fill(d: Display, x: number, y: number, w: number, bg: string) {
  for (let i = 0; i < w; i++) d.draw(x + i, y, " ", bg, bg);
}

function label(d: Display, x: number, y: number, w: number, text: string, bg: string) {
  const t = text.slice(0, w);
  const at = x + Math.max(0, (w - t.length) >> 1);
  for (let i = 0; i < t.length; i++) d.draw(at + i, y, t[i], INK, bg);
}

function drawHud(d: Display, g: GameState, cols: number, rows: number) {
  const h = hero(g);
  const hp = h ? `${h.hp}/${h.maxHp}` : "--";

  d.drawText(0, rows - 4, `%c{${DIM}}${(g.log[g.log.length - 1] ?? "").slice(0, cols)}`, cols);
  d.drawText(
    0,
    rows - 3,
    `%c{${PALETTE[15]}}♥%c{${INK}}${hp} %c{${PALETTE[20]}}†%c{${INK}}${minions(g).length}/${commandCap(g)} %c{${GOLD}}L%c{${INK}}${g.level + 1}`,
    cols,
  );

  const half = cols >> 1;
  const top = rows - BTN_ROWS;
  for (let r = 0; r < BTN_ROWS; r++) {
    fill(d, 0, top + r, half, BTN);
    fill(d, half, top + r, cols - half, BTN_ALT);
  }
  label(d, 0, top, half, "WAIT", BTN);
  label(d, half, top, cols - half, "MENU", BTN_ALT);
}

function drawPanel(d: Display, g: GameState, panel: Panel, cols: number, rows: number) {
  const r = panelRect(g, panel, cols, rows);
  const { title, lines } = panelLines(g, panel);

  for (let y = 0; y < r.h; y++) fill(d, r.x, r.y + y, r.w, DARK);
  for (let x = 1; x < r.w - 1; x++) {
    d.draw(r.x + x, r.y, "─", DIM, DARK);
    d.draw(r.x + x, r.y + r.h - 1, "─", DIM, DARK);
  }
  for (let y = 1; y < r.h - 1; y++) {
    d.draw(r.x, r.y + y, "│", DIM, DARK);
    d.draw(r.x + r.w - 1, r.y + y, "│", DIM, DARK);
  }
  d.draw(r.x, r.y, "┌", DIM, DARK);
  d.draw(r.x + r.w - 1, r.y, "┐", DIM, DARK);
  d.draw(r.x, r.y + r.h - 1, "└", DIM, DARK);
  d.draw(r.x + r.w - 1, r.y + r.h - 1, "┘", DIM, DARK);

  label(d, r.x + 1, r.y + 1, r.w - 2, title, DARK);
  lines.forEach((line, i) => {
    const text = line.text.slice(0, r.w - 2);
    const fg = line.action ? INK : DIM;
    for (let c = 0; c < text.length; c++) d.draw(r.x + 1 + c, r.y + 2 + i, text[c], fg, DARK);
  });
}
