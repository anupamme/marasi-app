import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HIGHLIGHTS, effectivePalette } from "./highlights.js";

const app = [
  { color: "#ef4444", label: "" },
  { color: "#f97316", label: "Auth" },
  { color: "#eab308", label: "Revisit" },
  { color: "#22c55e", label: "" },
  { color: "#06b6d4", label: "" },
  { color: "#3b82f6", label: "" },
  { color: "#a855f7", label: "" },
  { color: "#ec4899", label: "" },
];

test("the defaults are the spec's eight colours, named", () => {
  assert.deepEqual(
    DEFAULT_HIGHLIGHTS.map((h) => [h.number, h.name, h.color]),
    [
      [1, "Red", "#ef4444"],
      [2, "Orange", "#f97316"],
      [3, "Yellow", "#eab308"],
      [4, "Green", "#22c55e"],
      [5, "Cyan", "#06b6d4"],
      [6, "Blue", "#3b82f6"],
      [7, "Purple", "#a855f7"],
      [8, "Pink", "#ec4899"],
    ],
  );
});

test("an unlabelled highlight is called by its colour's name", () => {
  const palette = effectivePalette(app);
  assert.equal(palette[0].label, "Red");
  assert.equal(palette[0].scope, null);
});

test("an app label wins over the colour's name", () => {
  const palette = effectivePalette(app);
  assert.equal(palette[2].label, "Revisit");
  assert.equal(palette[2].scope, "app");
});

test("a project label wins over the app label", () => {
  const palette = effectivePalette(app, { 3: "IDOR candidate" });
  assert.equal(palette[2].label, "IDOR candidate");
  assert.equal(palette[2].scope, "project");
});

test("a project label wins over the colour's name too", () => {
  assert.equal(effectivePalette(app, { 1: "Leaks PII" })[0].label, "Leaks PII");
});

test("a blank label at either level falls through to the next", () => {
  const palette = effectivePalette(app, { 2: "   ", 4: "" });
  assert.equal(palette[1].label, "Auth");
  assert.equal(palette[3].label, "Green");
});

test("each highlight takes its colour from the app", () => {
  const recoloured = app.map((h, i) => (i === 5 ? { ...h, color: "#000080" } : h));
  const palette = effectivePalette(recoloured);
  assert.deepEqual(
    palette.map((h) => h.number),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(palette[5].color, "#000080");
  assert.equal(palette[5].label, "Blue");
});

test("before the app config loads, the palette is the defaults", () => {
  const palette = effectivePalette(undefined);
  assert.deepEqual(
    palette.map((h) => [h.color, h.label]),
    DEFAULT_HIGHLIGHTS.map((h) => [h.color, h.name]),
  );
});
