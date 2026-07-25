import type Display from "rot-js/lib/display/display.js";
import { CREATURES, type GameState, type Point } from "./sim/data.ts";
import { commandCap, corpseAt, explored, hero, minions, unitAt, visible } from "./sim/game.ts";
import { PALETTE } from "./tilemap";

const WALL = "▓";
const FLOOR_CH = ".";
const CORPSE = "%";
const STAIR = ">";

const INK = PALETTE[23];
const DARK = PALETTE[2];
const LIT_WALL = PALETTE[10];
const LIT_FLOOR = PALETTE[9];
const DIM_WALL = PALETTE[6];
const DIM_FLOOR = PALETTE[5];
const CORPSE_COL = PALETTE[14];
const STAIR_COL = PALETTE[22];

export const HUD_ROWS = 1;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function cameraFor(g: GameState, cols: number, rows: number): Point {
  const h = hero(g);
  const view = rows - HUD_ROWS;
  if (!h) return { x: 0, y: 0 };
  return {
    x: clamp(h.x - (cols >> 1), 0, Math.max(0, g.w - cols)),
    y: clamp(h.y - (view >> 1), 0, Math.max(0, g.h - view)),
  };
}

export function screenToWorld(cam: Point, sx: number, sy: number): Point {
  return { x: sx + cam.x, y: sy + cam.y };
}

export function render(d: Display, g: GameState, cols: number, rows: number) {
  const cam = cameraFor(g, cols, rows);
  const view = rows - HUD_ROWS;
  d.clear();

  for (let sy = 0; sy < view; sy++) {
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
          fg = unit.faction === "player" && unit.creature !== "hero" ? PALETTE[23] : PALETTE[t.color];
        }
      }

      d.draw(sx, sy, ch, fg, DARK);
    }
  }

  drawHud(d, g, cols, rows);
}

function drawHud(d: Display, g: GameState, cols: number, rows: number) {
  const h = hero(g);
  const hp = h ? `${h.hp}/${h.maxHp}` : "--";
  const cap = `${minions(g).length}/${commandCap(g)}`;
  const status = `%c{${PALETTE[15]}}♥%c{${INK}}${hp} %c{${PALETTE[20]}}†%c{${INK}}${cap} %c{${PALETTE[17]}}L%c{${INK}}${g.level + 1}`;
  d.drawText(0, rows - 1, status, cols);
}
