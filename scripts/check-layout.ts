// Run: npm run check
import assert from "node:assert/strict";
import { computeLayout, MAX_COLS, MAX_ROWS } from "../src/layout.ts";

const CASES = [
  { name: "pixel portrait", innerWidth: 360, innerHeight: 700, dpr: 3, reserved: 83 },
  { name: "pixel landscape", innerWidth: 800, innerHeight: 270, dpr: 3, reserved: 56 },
  { name: "iphone portrait", innerWidth: 390, innerHeight: 750, dpr: 3, reserved: 83 },
  { name: "desktop", innerWidth: 1920, innerHeight: 1080, dpr: 1, reserved: 56 },
  { name: "tiny", innerWidth: 240, innerHeight: 140, dpr: 1, reserved: 56 },
  { name: "absurdly short", innerWidth: 700, innerHeight: 60, dpr: 2, reserved: 56 },
];

for (const c of CASES) {
  const l = computeLayout(c);

  assert.ok(l.cols >= 1 && l.rows >= 1, `${c.name}: grid collapsed to ${l.cols}x${l.rows}`);
  assert.ok(l.cols <= MAX_COLS && l.rows <= MAX_ROWS, `${c.name}: grid exceeds caps`);

  // The bug this file exists for: the canvas must never outgrow its viewport
  assert.ok(l.cssW <= c.innerWidth, `${c.name}: ${l.cssW}px wide overflows ${c.innerWidth}px`);
  assert.ok(
    l.cssH <= c.innerHeight - c.reserved || l.rows === 1,
    `${c.name}: ${l.cssH}px tall overflows ${c.innerHeight - c.reserved}px of usable height`,
  );

  // Every source pixel must land on a whole number of device pixels
  assert.equal((l.cssW * c.dpr) % l.scale, 0, `${c.name}: fractional device pixels`);

  console.log(`ok  ${c.name.padEnd(16)} ${l.cols}x${l.rows} @ ${l.cell / c.dpr}css`);
}

console.log(`\n${CASES.length} layout cases passed`);
