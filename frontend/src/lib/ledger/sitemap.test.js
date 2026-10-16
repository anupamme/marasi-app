import { test } from "node:test";
import assert from "node:assert/strict";
import { activeSitemapNode, chooseSitemapNode, excludeSitemapNode, isPlaceholder, isSitemapExcluded, stripLabel } from "./sitemap.js";

const API = "https://api.acme.test";
const V2 = "https://api.acme.test/v2";

test("choosing a node adds its sitemap term to the query", () => {
  assert.equal(chooseSitemapNode("", V2), `sitemap = "${V2}"`);
  assert.equal(chooseSitemapNode("status_code >= 500", V2), `status_code >= 500 sitemap = "${V2}"`);
});

test("choosing a node replaces an earlier sitemap term and leaves the rest as typed", () => {
  assert.equal(
    chooseSitemapNode(`method = "POST"  sitemap = "${API}" AND status_code >= 500`, V2),
    `method = "POST"  status_code >= 500 sitemap = "${V2}"`,
  );
  assert.equal(chooseSitemapNode(`sitemap="${API}" note:*`, V2), `note:* sitemap = "${V2}"`);
});

test("choosing the active node again removes its term", () => {
  assert.equal(chooseSitemapNode(`status_code >= 500 AND sitemap = "${V2}"`, V2), "status_code >= 500");
  assert.equal(chooseSitemapNode(`sitemap = "${V2}"`, V2), "");
});

test("choosing a node keeps sitemap terms that are negated, excluded, nested or quoted", () => {
  const kept = `sitemap != "${API}/admin" NOT sitemap = "${API}/a" (sitemap = "${API}/b" OR host = "x") response_body:"sitemap = \\"y\\""`;
  assert.equal(chooseSitemapNode(kept, V2), `${kept} sitemap = "${V2}"`);
  assert.equal(chooseSitemapNode(`sitemap = "${API}" OR host = "x"`, V2), `sitemap = "${API}" OR host = "x" sitemap = "${V2}"`);
});

test("a node name with a quote or backslash is escaped in its term", () => {
  const name = 'https://api.acme.test/a"b\\c';
  const text = chooseSitemapNode("", name);
  assert.equal(text, 'sitemap = "https://api.acme.test/a\\"b\\\\c"');
  assert.equal(activeSitemapNode(text), name);
  assert.equal(chooseSitemapNode(text, name), "");
});

test("the eye button toggles a node's sitemap != term", () => {
  assert.equal(excludeSitemapNode("note:*", V2), `note:* sitemap != "${V2}"`);
  assert.equal(excludeSitemapNode(`note:* sitemap != "${V2}"`, V2), "note:*", "a second click shows it again");
  assert.equal(excludeSitemapNode(`sitemap != "${V2}" AND note:*`, V2), "note:*");
  assert.equal(isSitemapExcluded(`note:* sitemap != "${V2}"`, V2), true);
  assert.equal(isSitemapExcluded(`note:* sitemap != "${V2}"`, API), false);
});

test("the active node is the query's own sitemap = term", () => {
  assert.equal(activeSitemapNode(""), null);
  assert.equal(activeSitemapNode(`note:* sitemap = "${V2}"`), V2);
  assert.equal(activeSitemapNode(`sitemap != "${V2}"`), null);
  assert.equal(activeSitemapNode(`NOT sitemap = "${V2}"`), null);
  assert.equal(activeSitemapNode(`sitemap = "${V2}" OR note:*`), null);
});

test("the collapsed strip shows the active node without its scheme, else Sitemap", () => {
  assert.equal(stripLabel(null), "Sitemap");
  assert.equal(stripLabel(V2), "api.acme.test/v2");
  assert.equal(stripLabel("http://localhost:8080"), "localhost:8080");
});

test("only Marasi's collapsed segments are placeholders", () => {
  assert.ok(isPlaceholder("{uuid}"));
  assert.ok(isPlaceholder("{int}"));
  assert.ok(isPlaceholder("{hash}"));
  assert.ok(!isPlaceholder("{id}"));
  assert.ok(!isPlaceholder("users"));
});
