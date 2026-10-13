import { test } from "node:test";
import assert from "node:assert/strict";
import { jumpTarget, latestEntry } from "./jumpTarget.js";

// Rows 20px tall in document order; the viewport shows y 0..100 and its
// sticky launchpad header covers the top 34px.
const row = (list, top, last = false) => ({ list, label: `L ${list}`, top, bottom: top + 20, last });
const view = { top: 0, bottom: 100 };

test("targets the list at the top of the viewport while its last entry is below the fold", () => {
  const rows = [row("a", 20), row("a", 40), row("a", 60), row("a", 160, true), row("b", 180, true)];
  assert.deepEqual(jumpTarget(rows, view), { list: "a", label: "L a" });
});

test("rows hidden under the sticky header do not count as the top list", () => {
  const rows = [row("a", -10, true), row("b", 30), row("b", 200, true)];
  assert.deepEqual(jumpTarget(rows, view), { list: "b", label: "L b" });
});

test("no target once the list's last entry is fully in view", () => {
  const rows = [row("a", 40), row("a", 70, true), row("b", 300, true)];
  assert.equal(jumpTarget(rows, view), null);
});

test("a last entry cut off by the fold still needs the button", () => {
  const rows = [row("a", 40), row("a", 90, true)];
  assert.deepEqual(jumpTarget(rows, view), { list: "a", label: "L a" });
});

test("a collapsed header at the top shows no target, not a list further down", () => {
  const header = (top) => ({ list: null, label: null, top, bottom: top + 20, last: false });
  const rows = [header(40), row("b", 60), row("b", 200, true)];
  assert.equal(jumpTarget(rows, view), null);
});

test("no target when nothing is in view", () => {
  assert.equal(jumpTarget([], view), null);
  assert.equal(jumpTarget([row("a", -100, true)], view), null);
});

// ⌘⇧↓: the open launchpad's newest Launchpad entry, whatever is on screen.
const lists = {
  launchpads: [{ ID: "lp1" }, { ID: "lp2" }],
  entriesByLaunchpad: { lp1: [{ ID: "a" }, { ID: "b" }, { ID: "c" }], lp2: [{ ID: "d" }] },
};

test("the latest entry is the open launchpad's newest, even in a short list", () => {
  assert.deepEqual(latestEntry({ ...lists, selectedLaunchpadId: "lp1" }), { launchpadId: "lp1", entryId: "c" });
  assert.deepEqual(latestEntry({ ...lists, selectedLaunchpadId: "lp2" }), { launchpadId: "lp2", entryId: "d" });
});

test("no latest entry without an open launchpad or before its entries load", () => {
  assert.equal(latestEntry({ ...lists, selectedLaunchpadId: null }), null);
  assert.equal(latestEntry({ ...lists, selectedLaunchpadId: "lp3" }), null);
  assert.equal(latestEntry({ ...lists, entriesByLaunchpad: { lp1: [] }, selectedLaunchpadId: "lp1" }), null);
});
