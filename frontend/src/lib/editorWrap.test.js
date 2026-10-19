import { test } from "node:test";
import assert from "node:assert/strict";
import { LONG_LINE_LIMIT, wrapsLines } from "./editorWrap.js";

const head = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n";

test("an ordinary body wraps when wrapping is on, and never when it is off", () => {
  const body = head + '{"a":1}\n'.repeat(5000);
  assert.equal(wrapsLines(body, true), true);
  assert.equal(wrapsLines(body, false), false);
});

// A 550 KB minified body is one line. CodeMirror draws a wrapped line that
// long in full while it first measures it, and WebKit takes about 3 s to lay
// it out, freezing the page.
test("a body with one line longer than the limit does not wrap", () => {
  assert.equal(LONG_LINE_LIMIT, 20_000);
  assert.equal(wrapsLines(head + "x".repeat(553_000), true), false);
  assert.equal(wrapsLines(head + "x".repeat(20_000) + "\nshort", true), false);
});

test("a line just under the limit still wraps", () => {
  assert.equal(wrapsLines(head + "x".repeat(19_999) + "\r\n" + "y".repeat(19_999), true), true);
});

test("the last line counts too, and an empty or missing body wraps", () => {
  assert.equal(wrapsLines("short\n" + "x".repeat(25_000), true), false);
  assert.equal(wrapsLines("", true), true);
  assert.equal(wrapsLines(undefined, true), true);
});
