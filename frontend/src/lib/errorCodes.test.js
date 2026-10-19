import { test } from "node:test";
import assert from "node:assert/strict";
import { codeIDs } from "./errorCodes.js";

test("a code's ids are read from the error's text", () => {
  const error = new Error("deleting traffic: launch_pending (a1, b2): a launch is pending");
  assert.deepEqual(codeIDs(error, "launch_pending"), ["a1", "b2"]);
  assert.deepEqual(codeIDs("unlinking traffic: launch_pending (b)", "launch_pending"), ["b"]);
  assert.deepEqual(codeIDs("x: selection_incomplete (sitemap): …", "selection_incomplete"), ["sitemap"]);
});

test("a code without ids reads as none", () => {
  assert.deepEqual(codeIDs("moving launchpad entries: already_linked: pair is linked", "already_linked"), []);
});

test("an error without the code reads as null", () => {
  assert.equal(codeIDs("moving launchpad entries: not_linked: …", "already_linked"), null);
  assert.equal(codeIDs("x: not_linked_extra: …", "not_linked"), null);
  assert.equal(codeIDs(undefined, "launch_pending"), null);
});
