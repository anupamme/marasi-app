import { test } from "node:test";
import assert from "node:assert/strict";
import { entryLengthText, statusClass } from "./format.js";

test("status colours: pending dimmed, then success, warning, error", () => {
  assert.equal(statusClass(0), "opacity-50");
  assert.equal(statusClass(200), "text-success-500");
  assert.equal(statusClass(500), "text-error-500");
});

// The theme's warning-500 (#ebe280) is unreadable on a light surface.
test("3xx statuses use a darker warning in light mode", () => {
  assert.equal(statusClass(302), "text-warning-800 dark:text-warning-500");
});

test("a stored pair without a response (-1) is dimmed like a pending one", () => {
  assert.equal(statusClass(-1), "opacity-50");
});

test("an entry's length shows only once it has a response", () => {
  // Marasi reports an unanswered pair's length as "0".
  assert.equal(entryLengthText({ StatusCode: 0, Length: "0" }), "");
  assert.equal(entryLengthText({ StatusCode: -1, Length: "0" }), "");
  assert.equal(entryLengthText({ StatusCode: 0, Length: "" }), "");
  assert.equal(entryLengthText({ StatusCode: 200, Length: "512" }), "512");
  assert.equal(entryLengthText({ StatusCode: 204, Length: "0" }), "0");
});
