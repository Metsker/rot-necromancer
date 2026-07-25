import { TILE } from "./tilemap.ts";

export const TARGET_TILE_CSS = 16;
export const MAX_COLS = 64;
export const MAX_ROWS = 64;

export type Viewport = {
  innerWidth: number;
  innerHeight: number;
  dpr: number;
  reserved: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

// Scale is picked for legibility in device pixels; the grid only ever takes what fits
export function computeLayout({ innerWidth, innerHeight, dpr, reserved }: Viewport) {
  const scale = Math.max(1, Math.round((TARGET_TILE_CSS * dpr) / TILE));
  const cell = TILE * scale;
  const cols = clamp(Math.floor((innerWidth * dpr) / cell), 1, MAX_COLS);
  const rows = clamp(Math.floor(((innerHeight - reserved) * dpr) / cell), 1, MAX_ROWS);
  return { dpr, scale, cell, cols, rows, cssW: (cols * cell) / dpr, cssH: (rows * cell) / dpr };
}
