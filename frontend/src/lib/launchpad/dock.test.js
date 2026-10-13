import { test } from "node:test";
import assert from "node:assert/strict";
import { DOCK, dragWidth, settleDrag } from "./dock.js";

test("the dock starts 400px wide", () => {
  assert.equal(DOCK.default, 400);
});

test("dragging follows the pointer but never past 640px", () => {
  assert.equal(dragWidth(400, 100), 500);
  assert.equal(dragWidth(400, 900), 640);
  assert.equal(dragWidth(400, -900), 0);
});

test("releasing below 170px snaps the dock to the collapsed strip", () => {
  assert.deepEqual(settleDrag(169, 400), { collapsed: true, width: 400 });
});

test("releasing between 170px and 260px keeps it open at the 260px minimum", () => {
  assert.deepEqual(settleDrag(170, 400), { collapsed: false, width: 260 });
  assert.deepEqual(settleDrag(500, 400), { collapsed: false, width: 500 });
});
