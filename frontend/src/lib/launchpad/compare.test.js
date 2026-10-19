import { test } from "node:test";
import assert from "node:assert/strict";
import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { changedLineCount, compareClick, compareEscape, compareView, lengthSummary } from "./compare.js";

const entry = (id) => ({ ID: id, Method: "GET", Path: `/${id}` });
const state = (compare) => ({
  selectedLaunchpadId: "lp1",
  entriesByLaunchpad: { lp1: ["a", "b", "c", "d"].map(entry), lp2: [entry("z")] },
  detailsById: {},
  compare,
});
const picking = (side, leftId = "c", rightId = null) =>
  state({ launchpadId: "lp1", leftId, rightId, picking: side });

test("with no compare an entry click selects the entry", () => {
  assert.equal(compareClick(state(null), "lp1", "a"), null);
});

test("while picking B, a click on another entry of the launchpad fills B", () => {
  assert.equal(compareClick(picking("right"), "lp1", "a"), "right");
});

test("while re-picking A, a click fills A", () => {
  assert.equal(compareClick(picking("left", "c", "a"), "lp1", "b"), "left");
});

test("a click on the entry already on the other side is ignored", () => {
  assert.equal(compareClick(picking("right"), "lp1", "c"), "ignore");
  assert.equal(compareClick(picking("left", "c", "a"), "lp1", "a"), "ignore");
});

test("once the diff shows, a plain click replaces B", () => {
  assert.equal(compareClick(picking(null, "c", "a"), "lp1", "d"), "right");
});

test("a click in another launchpad selects normally", () => {
  assert.equal(compareClick(picking("right"), "lp2", "z"), null);
});

test("Esc first cancels a chip re-pick, then closes compare; without compare it does nothing", () => {
  assert.equal(compareEscape(picking("left", "c", "a")), "stop-picking");
  assert.equal(compareEscape(picking(null, "c", "a")), "close");
  assert.equal(compareEscape(picking("right")), "close");
  assert.equal(compareEscape(state(null)), null);
});

test("the view numbers A and B in entry order and offers quick picks around A", () => {
  const view = compareView(picking("right", "b"));
  assert.equal(view.comparing, false);
  assert.deepEqual([view.left.number, view.left.entry.ID, view.right], [2, "b", null]);
  assert.deepEqual(view.quickPicks, [
    { label: "Previous (#1)", id: "a" },
    { label: "Next (#3)", id: "c" },
  ]);
});

test("Original is a quick pick only when it is not already Previous or A", () => {
  assert.deepEqual(
    compareView(picking("right", "d")).quickPicks.map((pick) => pick.label),
    ["Previous (#3)", "Original (#1)"],
  );
  assert.deepEqual(
    compareView(picking("right", "a")).quickPicks.map((pick) => pick.label),
    ["Next (#2)"],
  );
});

test("the view is null when compare belongs to another launchpad than the open one", () => {
  const other = { ...picking("right"), selectedLaunchpadId: "lp2" };
  assert.equal(compareView(other), null);
});

test("length summary compares response lengths, or request text lengths on the request tab", () => {
  const left = { Request: { Raw: "GET /a" }, Response: { Raw: "x".repeat(10), Length: 120 } };
  const right = { Request: { Raw: "GET /abc" }, Response: { Raw: "y", Length: 95 } };
  assert.deepEqual(lengthSummary(left, right, "response"), { left: 120, right: 95, delta: -25 });
  assert.deepEqual(lengthSummary(left, right, "request"), { left: 6, right: 8, delta: 2 });
});

test("response Length arrives from Go as a string and is read as a number", () => {
  const left = { Response: { Raw: "", Length: "1200" } };
  const right = { Response: { Raw: "", Length: "980" } };
  assert.deepEqual(lengthSummary(left, right, "response"), { left: 1200, right: 980, delta: -220 });
});

test("length summary falls back to the raw length, and is unknown while a side is pending", () => {
  const left = { Request: { Raw: "" }, Response: { Raw: "abcd" } };
  const pending = { Request: { Raw: "" }, Response: null };
  assert.deepEqual(lengthSummary(left, left, "response"), { left: 4, right: 4, delta: 0 });
  assert.deepEqual(lengthSummary(left, pending, "response"), { left: 4, right: null, delta: null });
  assert.deepEqual(lengthSummary(undefined, left, "response"), { left: null, right: 4, delta: null });
});

const changed = (a, b) =>
  changedLineCount(Chunk.build(Text.of(a.split("\n")), Text.of(b.split("\n"))), a, b);

test("changed lines: identical texts have none", () => {
  assert.equal(changed("GET / HTTP/1.1\nHost: a", "GET / HTTP/1.1\nHost: a"), 0);
});

test("changed lines: an edited line counts once, not once per side", () => {
  assert.equal(changed("a\nb\nc", "a\nx\nc"), 1);
});

test("changed lines: added and removed lines count, including the last line", () => {
  assert.equal(changed("a\nd", "a\nb\nc\nd"), 2);
  assert.equal(changed("a\nb\nc", "a\nc"), 1);
  assert.equal(changed("a\nb", "a\nc"), 1);
});

test("changed lines: a replaced run counts its longer side", () => {
  assert.equal(changed("a\nx1\nx2\nx3\nz", "a\ny1\nz"), 3);
});
