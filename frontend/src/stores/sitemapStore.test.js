import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import {
  createSitemapStore,
  hostCountLabel,
  sitemapRows,
  sitemapScope,
  FETCH_SIZE,
  STEP,
  WINDOW,
} from "./createSitemapStore.js";

const API = "https://api.acme.test";
const V2 = `${API}/v2`;

function child(name, pairs, { errors = 0, hasChildren = false, matching } = {}) {
  const segment = name.includes("/", name.indexOf("://") + 3) ? name.slice(name.lastIndexOf("/") + 1) : name;
  return { Name: name, Segment: segment, Pairs: pairs, Errors: errors, HasChildren: hasChildren, Matching: matching };
}

// A Marasi sitemap held in memory: children by node name ("" for the
// origins), busiest first, paged by offset. `matching` holds the children
// query mode returns instead. Calls are recorded in `api.calls`.
function fakeApi({ tree = {}, matching = {}, complete = true } = {}) {
  const calls = [];
  const api = {
    calls,
    tree,
    complete,
    listSitemapChildren: async (request) => {
      calls.push(request);
      const source = request.Matching ? matching : api.tree;
      if (!(request.Node in source) && request.Node !== "") {
        return { Children: [], NextCursor: null, Complete: true, Missing: true };
      }
      const all = source[request.Node] ?? [];
      const from = request.Cursor ? Number(request.Cursor) : 0;
      const to = from + request.Limit;
      return {
        Children: all.slice(from, to).map((c) => ({ ...c })),
        NextCursor: to < all.length ? String(to) : null,
        Complete: api.complete,
        Missing: false,
      };
    },
  };
  return api;
}

function many(parent, count, pairsFrom = 1000) {
  return Array.from({ length: count }, (_, i) => child(`${parent}/p${i}`, pairsFrom - i));
}

const LIVE = { query: "", asOf: null, exclusion: [], ready: true };

async function loadedStore(api, context = LIVE) {
  const store = createSitemapStore(api);
  store.setContext(context);
  await store.settled();
  return store;
}

function nodeRows(state, find = "") {
  return sitemapRows(state, find)
    .filter((row) => row.kind === "node")
    .map((row) => `${"  ".repeat(row.depth)}${row.node.Segment}`);
}

test("the origins load once the ledger's first rows have", async () => {
  const api = fakeApi({ tree: { "": [child(API, 5, { hasChildren: true }), child("https://www.acme.test", 2)] } });
  const store = createSitemapStore(api);

  store.setContext({ ...LIVE, ready: false });
  await store.settled();
  assert.equal(api.calls.length, 0);

  store.setContext(LIVE);
  await store.settled();
  assert.deepEqual(nodeRows(get(store)), [API, "https://www.acme.test"]);
  assert.deepEqual(api.calls, [{ Node: "", Cursor: "", Limit: FETCH_SIZE, Query: "", AsOf: "", Matching: false }]);
  assert.equal(hostCountLabel(get(store)), "2 hosts");

  // Later reads of the table, such as a new sort, don't read it again.
  store.setContext({ ...LIVE, ready: false });
  store.setContext(LIVE);
  await store.settled();
  assert.equal(api.calls.length, 1);
});

test("each level shows its busiest 10 children, then N more, 50 at a time", async () => {
  const api = fakeApi({ tree: { "": [child(API, 9999, { hasChildren: true })], [API]: many(API, 75) } });
  const store = await loadedStore(api);

  store.toggle(API);
  await store.settled();
  let rows = sitemapRows(get(store));
  assert.equal(rows.filter((row) => row.kind === "node" && row.depth === 1).length, WINDOW);
  assert.deepEqual(rows.at(-1), { kind: "more", parent: API, depth: 1, hidden: 65, partial: false });

  store.showMore(API);
  rows = sitemapRows(get(store));
  assert.equal(rows.filter((row) => row.kind === "node" && row.depth === 1).length, WINDOW + STEP);
  assert.equal(rows.at(-1).hidden, 15);

  store.showMore(API);
  rows = sitemapRows(get(store));
  assert.equal(rows.filter((row) => row.kind === "node" && row.depth === 1).length, 75);
  assert.notEqual(rows.at(-1).kind, "more");
});

test("showing more past the loaded children reads the next page by cursor", async () => {
  const api = fakeApi({ tree: { "": [child(API, 9999, { hasChildren: true })], [API]: many(API, FETCH_SIZE + 3) } });
  const store = await loadedStore(api);
  store.toggle(API);
  await store.settled();
  assert.deepEqual(sitemapRows(get(store)).at(-1), { kind: "more", parent: API, depth: 1, hidden: FETCH_SIZE - WINDOW, partial: true });

  for (let shown = WINDOW; shown < FETCH_SIZE; shown += STEP) store.showMore(API);
  await store.settled();

  const last = api.calls.at(-1);
  assert.equal(last.Node, API);
  assert.equal(last.Cursor, String(FETCH_SIZE));
  const rows = sitemapRows(get(store));
  assert.equal(rows.filter((row) => row.kind === "node" && row.depth === 1).length, FETCH_SIZE + 3);
});

test("a node's children load when it is first opened, and Collapse all closes every node", async () => {
  const api = fakeApi({
    tree: {
      "": [child(API, 3, { hasChildren: true })],
      [API]: [child(V2, 3, { hasChildren: true })],
      [V2]: [child(`${V2}/users`, 2), child(`${V2}/{int}`, 1)],
    },
  });
  const store = await loadedStore(api);

  store.toggle(API);
  await store.settled();
  store.toggle(V2);
  await store.settled();
  assert.deepEqual(nodeRows(get(store)), [API, "  v2", "    users", "    {int}"]);

  store.toggle(V2);
  store.toggle(V2);
  await store.settled();
  assert.equal(api.calls.filter((call) => call.Node === V2).length, 1);

  store.collapseAll();
  assert.deepEqual(nodeRows(get(store)), [API]);
});

test("the find box keeps nodes whose name matches, with the loaded nodes leading to them", async () => {
  const api = fakeApi({
    tree: {
      "": [child(API, 3, { hasChildren: true }), child("https://www.acme.test", 2, { hasChildren: true })],
      [API]: [child(V2, 3, { hasChildren: true })],
      [V2]: [child(`${V2}/users`, 2), child(`${V2}/orders`, 1)],
      "https://www.acme.test": [child("https://www.acme.test/about", 2)],
    },
  });
  const store = await loadedStore(api);
  store.toggle(API);
  await store.settled();
  store.toggle(V2);
  await store.settled();
  store.collapseAll();

  assert.deepEqual(nodeRows(get(store), "USERS"), [API, "  v2", "    users"]);
  assert.deepEqual(nodeRows(get(store), "www"), ["https://www.acme.test"]);
  assert.deepEqual(nodeRows(get(store), "nothing"), []);
});

test("Matching the query is only in effect while a query runs, with its results' as_of", async () => {
  const api = fakeApi({
    tree: { "": [child(API, 5), child("https://www.acme.test", 2)] },
    matching: { "": [child(API, 1)] },
  });
  const store = await loadedStore(api);
  store.setScope("matching");
  assert.equal(sitemapScope(get(store)), "all");

  store.setContext({ ...LIVE, query: "status_code >= 500", asOf: "pair-9" });
  await store.settled();
  assert.equal(sitemapScope(get(store)), "matching");
  assert.deepEqual(api.calls.at(-1), {
    Node: "", Cursor: "", Limit: FETCH_SIZE, Query: "status_code >= 500", AsOf: "pair-9", Matching: true,
  });
  assert.deepEqual(nodeRows(get(store)), [API]);

  store.setContext(LIVE);
  await store.settled();
  assert.equal(sitemapScope(get(store)), "all");
  assert.equal(api.calls.at(-1).Matching, false);
  assert.deepEqual(nodeRows(get(store)), [API, "https://www.acme.test"]);
});

test("All traffic with a query asks for matching counts and dims nodes without matches", async () => {
  const api = fakeApi({ tree: { "": [child(API, 5, { matching: 2 }), child("https://www.acme.test", 2, { matching: 0 })] } });
  const store = await loadedStore(api, { ...LIVE, query: "note:*", asOf: "pair-3" });

  assert.deepEqual(api.calls.at(-1), { Node: "", Cursor: "", Limit: FETCH_SIZE, Query: "note:*", AsOf: "pair-3", Matching: false });
  const rows = sitemapRows(get(store)).filter((row) => row.kind === "node");
  assert.deepEqual(
    rows.map((row) => [row.node.Segment, row.matching, row.dimmed]),
    [[API, 2, false], ["https://www.acme.test", 0, true]],
  );
});

test("the open levels reload when the query, its as_of or the exclusion changes, and stale reads are dropped", async () => {
  const api = fakeApi({
    tree: { "": [child(API, 5, { hasChildren: true })], [API]: [child(V2, 5)] },
  });
  const store = await loadedStore(api, { ...LIVE, query: "note:*", asOf: "pair-3" });
  store.toggle(API);
  await store.settled();
  const before = api.calls.length;

  // Live traffic moves the live view's as_of; that alone reloads nothing.
  store.setContext({ ...LIVE, asOf: "pair-4" });
  store.setContext({ ...LIVE, asOf: "pair-5" });
  await store.settled();
  assert.deepEqual(api.calls.slice(before).map((call) => call.Node), ["", API]);

  store.setContext({ ...LIVE, asOf: "pair-6" });
  await store.settled();
  assert.equal(api.calls.length, before + 2);

  store.setContext({ ...LIVE, asOf: "pair-6", exclusion: ["image/*"] });
  await store.settled();
  assert.equal(api.calls.length, before + 4);

  store.setContext({ ...LIVE, query: "note:*", asOf: "pair-6", exclusion: ["image/*"] });
  store.setContext({ ...LIVE, query: "note:*", asOf: "pair-7", exclusion: ["image/*"] });
  await store.settled();
  assert.deepEqual(api.calls.slice(-2).map((call) => [call.Node, call.AsOf]), [["", "pair-7"], [API, "pair-7"]]);
});

test("the header warns while Marasi's sitemap is still building", async () => {
  const api = fakeApi({ tree: { "": [child(API, 5)] }, complete: false });
  const store = await loadedStore(api);
  assert.equal(get(store).complete, false);

  api.complete = true;
  store.reload();
  await store.settled();
  assert.equal(get(store).complete, true);
});

test("new pairs bump their leaf and its loaded ancestors in All traffic", async () => {
  const api = fakeApi({
    tree: {
      "": [child(API, 5, { hasChildren: true })],
      [API]: [child(V2, 5, { hasChildren: true })],
      [V2]: [child(`${V2}/users`, 4), child(`${V2}/{int}`, 1)],
    },
  });
  const store = await loadedStore(api);
  store.toggle(API);
  await store.settled();
  store.toggle(V2);
  await store.settled();

  store.onRequest({ ID: "a", SitemapNode: `${V2}/{int}` });
  store.onRequest({ ID: "b", SitemapNode: `${V2}/carts` });
  store.onRequest({ ID: "c", SitemapNode: "https://new.acme.test/x" });
  store.flush();

  const counts = sitemapRows(get(store))
    .filter((row) => row.kind === "node")
    .map((row) => `${row.node.Segment} ${row.node.Pairs}${row.node.HasChildren ? "+" : ""}`);
  assert.deepEqual(counts, [`${API} 7+`, "v2 7+", "users 4", "{int} 2", "carts 1", "https://new.acme.test 1+"]);
  assert.equal(hostCountLabel(get(store)), "2 hosts");
});

test("a response bumps its node's 5xx count, and drops a pair the exclusion hides", async () => {
  const api = fakeApi({ tree: { "": [child(API, 5, { hasChildren: true })], [API]: [child(`${API}/a`, 5)] } });
  const store = await loadedStore(api, { ...LIVE, exclusion: ["image/*"] });
  store.toggle(API);
  await store.settled();

  store.onRequest({ ID: "a", SitemapNode: `${API}/a` });
  store.onRequest({ ID: "b", SitemapNode: `${API}/a` });
  store.onResponse({ ID: "a", StatusCode: 503, ContentType: "text/html" });
  store.onResponse({ ID: "b", StatusCode: 200, ContentType: "image/png" });
  store.flush();

  const rows = sitemapRows(get(store)).filter((row) => row.kind === "node");
  assert.deepEqual(rows.map((row) => [row.node.Pairs, row.node.Errors]), [[6, 1], [6, 1]]);
});

test("live pairs leave Matching the query's snapshot counts alone", async () => {
  const api = fakeApi({ tree: { "": [child(API, 5)] }, matching: { "": [child(API, 1)] } });
  const store = await loadedStore(api, { ...LIVE, query: "note:*", asOf: "pair-1" });
  store.setScope("matching");
  await store.settled();

  store.onRequest({ ID: "a", SitemapNode: `${API}/x` });
  store.flush();

  assert.equal(sitemapRows(get(store))[0].node.Pairs, 1);
});

test("a project switch empties the sitemap until it loads again", async () => {
  const api = fakeApi({ tree: { "": [child(API, 5, { hasChildren: true })], [API]: [child(V2, 5)] } });
  const store = await loadedStore(api);
  store.toggle(API);
  await store.settled();

  store.clear();
  assert.deepEqual(nodeRows(get(store)), []);

  api.tree = { "": [child("https://other.test", 1)] };
  store.setContext(LIVE);
  await store.settled();
  assert.deepEqual(nodeRows(get(store)), ["https://other.test"]);
});

test("a reload reads only the open levels; a closed one reads again when it next opens", async () => {
  const api = fakeApi({
    tree: { "": [child(API, 5, { hasChildren: true })], [API]: [child(V2, 5)] },
  });
  const store = await loadedStore(api);
  store.toggle(API);
  await store.settled();
  store.toggle(API);

  store.reload();
  await store.settled();
  assert.deepEqual(api.calls.slice(-1).map((call) => call.Node), [""]);

  store.toggle(API);
  await store.settled();
  assert.equal(api.calls.at(-1).Node, API);
  assert.deepEqual(nodeRows(get(store)), [API, "  v2"]);
});
