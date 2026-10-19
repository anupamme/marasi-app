import { test } from "node:test";
import assert from "node:assert/strict";
import { dropTarget, moveRefusal } from "./entryMove.js";

// A row 20 px tall at y 100, so its halves meet at 110.
const row = (launchpadId, entryId) => ({ kind: "entry", launchpadId, entryId, top: 100, height: 20 });
const order = ["a", "b", "c", "d", "e"];

test("the top half of an entry row places the moved entries before it", () => {
  const target = dropTarget({ hit: row("lp1", "c"), pointerY: 105, order, moving: ["x"] });
  assert.deepEqual(target, { launchpadId: "lp1", before: "c", via: "entry", line: { entryId: "c", edge: "top" } });
});

test("the bottom half places them before the next entry, or at the end after the last", () => {
  assert.equal(dropTarget({ hit: row("lp1", "c"), pointerY: 115, order, moving: ["x"] }).before, "d");
  const last = dropTarget({ hit: row("lp1", "e"), pointerY: 115, order, moving: ["x"] });
  assert.deepEqual(last, { launchpadId: "lp1", before: null, via: "entry", line: { entryId: "e", edge: "bottom" } });
});

test("placement skips the entries being moved", () => {
  // Under b, with c and d moving: the first entry not moving is e.
  assert.equal(dropTarget({ hit: row("lp1", "b"), pointerY: 115, order, moving: ["c", "d"] }).before, "e");
  assert.equal(dropTarget({ hit: row("lp1", "d"), pointerY: 105, order, moving: ["d", "e"] }).before, null);
});

test("a launchpad row appends at its end", () => {
  const target = dropTarget({ hit: { kind: "launchpad", launchpadId: "lp2" }, pointerY: 0, order: ["z"], moving: ["a"] });
  assert.deepEqual(target, { launchpadId: "lp2", before: null, via: "launchpad", line: null });
});

test("anything else is no drop target", () => {
  assert.equal(dropTarget({ hit: null, pointerY: 0, order, moving: ["a"] }), null);
});

// Moving b and c out of lp1; lp2 is named Search and holds x.
const move = (fields) => ({
  sourceId: "lp1",
  ids: ["b", "c"],
  target: { launchpadId: "lp2", via: "launchpad" },
  targetName: "Search",
  targetIds: ["x"],
  pendingIds: [],
  ...fields,
});

test("a move nothing stands in the way of is not refused", () => {
  assert.equal(moveRefusal(move()), null);
});

test("entries still launching cannot go to another launchpad", () => {
  assert.equal(moveRefusal(move({ pendingIds: ["c"] })), "1 launching");
  assert.equal(moveRefusal(move({ pendingIds: ["b", "c"] })), "2 launching");
});

test("entries still launching can be reordered in their own launchpad", () => {
  const reorder = { launchpadId: "lp1", via: "entry" };
  assert.equal(moveRefusal(move({ target: reorder, targetIds: ["a", "b", "c"], pendingIds: ["c"] })), null);
});

test("a pair the target already holds refuses the whole move", () => {
  assert.equal(moveRefusal(move({ targetIds: ["x", "c"] })), "1 already in Search");
  assert.equal(moveRefusal(move({ targetIds: ["b", "c"] })), "2 already in Search");
});

test("a target whose entries are not loaded yet is left to Marasi", () => {
  assert.equal(moveRefusal(move({ targetIds: null })), null);
});

test("grouped by status or searching, reorders and drops between rows are off", () => {
  const between = { launchpadId: "lp2", via: "entry" };
  const ownRow = { launchpadId: "lp1", via: "launchpad" };
  assert.equal(moveRefusal(move({ grouped: true, target: between })), "Grouped by status");
  assert.equal(moveRefusal(move({ searching: true, target: between })), "Searching");
  assert.equal(moveRefusal(move({ grouped: true, target: ownRow, targetIds: ["a", "b", "c"] })), "Grouped by status");
  // Another launchpad's own row still takes the move.
  assert.equal(moveRefusal(move({ grouped: true, searching: true })), null);
});
