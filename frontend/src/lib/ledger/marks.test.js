import { test } from "node:test";
import assert from "node:assert/strict";
import { activeMarkCount, matchCountText, MARKS } from "./marks.js";

test("the Marks menu offers the pinned release's mark terms", () => {
  assert.deepEqual(
    MARKS.map((mark) => mark.term),
    ["note:*", "finding:*", "test_case:*", "launchpad:*", "metadata.intercepted = true"],
  );
});

test("the active mark count counts mark terms that stand on their own in the query", () => {
  assert.equal(activeMarkCount(""), 0);
  assert.equal(activeMarkCount('host = "a" note:* AND launchpad:*'), 2);
  assert.equal(activeMarkCount("metadata.intercepted = true"), 1);
  assert.equal(activeMarkCount("NOT note:* finding:* OR test_case:*"), 0);
});

test("a count reads as a number, 100,000+ past the cap, and a dash when unknown", () => {
  assert.equal(matchCountText({ count: 1234, capped: false }), "1,234");
  assert.equal(matchCountText({ count: 100000, capped: true }), "100,000+");
  assert.equal(matchCountText(null), "–");
  assert.equal(matchCountText(undefined), "…");
});
