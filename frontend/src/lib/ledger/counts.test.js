import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCount, matchCountText, matchNoun, plural, requestCount } from "./counts.js";

test("a count reads as a number, 100,000+ past the cap, a dash when unknown and ! when invalid", () => {
  assert.equal(matchCountText({ count: 1234, capped: false }), "1,234");
  assert.equal(matchCountText({ count: 100000, capped: true }), "100,000+");
  assert.equal(matchCountText(null), "–");
  assert.equal(matchCountText(undefined), "…");
  assert.equal(matchCountText({ error: "expected a value" }), "!");
  assert.equal(formatCount(100000, true), "100,000+");
});

test("plurals name one thing or many", () => {
  assert.equal(requestCount(1), "1 request");
  assert.equal(requestCount(1200), "1,200 requests");
  assert.equal(plural(2, "match", "matches"), "2 matches");
  assert.equal(matchNoun(1), "match");
  assert.equal(matchNoun(1, true), "matches");
  assert.equal(matchNoun(0), "matches");
});
