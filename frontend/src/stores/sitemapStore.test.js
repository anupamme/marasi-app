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
  assert.deepEqual(api.calls, [
    { Node: "", Cursor: "", Limit: FETCH_SIZE, Query: "", AsOf: "", Matching: false, Exclusion: [] },
  ]);
  assert.equal(hostCountLabel(get(store)), "2 hosts");

  // Later reads of the table, such as a new sort, don't read it again.
  store.setContext({ ...LIVE, ready: false });
  store.setContext(LIVE);
  await store.settled();
  assert.equal(api.calls.length, 1);
});

test("the sitemap reads under the ledger's exclusion, not whatever is stored yet", async () => {
  const api = fakeApi({ tree: { "": [child(API, 5)] } });
  const store = await loadedStore(api);
  store.setContext({ ...LIVE, exclusion: ["image/*"] });
  await store.settled();
  assert.deepEqual(api.calls.at(-1).Exclusion, ["image/*"]);
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
    Node: "", Cursor: "", Limit: FETCH_SIZE, Query: "status_code >= 500", AsOf: "pair-9", Matching: true, Exclusion: [],
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

  assert.deepEqual(api.calls.at(-1), { Node: "", Cursor: "", Limit: FETCH_SIZE, Query: "note:*", AsOf: "pair-3", Matching: false, Exclusion: [] });
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
  // Deepest first: an open level's counts before its parent's.
  assert.deepEqual(api.calls.slice(before).map((call) => call.Node), [API, ""]);

  store.setContext({ ...LIVE, asOf: "pair-6" });
  await store.settled();
  assert.equal(api.calls.length, before + 2);

  store.setContext({ ...LIVE, asOf: "pair-6", exclusion: ["image/*"] });
  await store.settled();
  assert.equal(api.calls.length, before + 4);

  store.setContext({ ...LIVE, query: "note:*", asOf: "pair-6", exclusion: ["image/*"] });
  store.setContext({ ...LIVE, query: "note:*", asOf: "pair-7", exclusion: ["image/*"] });
  await store.settled();
  assert.deepEqual(api.calls.slice(-2).map((call) => [call.Node, call.AsOf]), [[API, "pair-7"], ["", "pair-7"]]);
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

// Holds each read until the test releases it, recording the most reads in
// flight at once.
function gatedApi(base) {
  const waiting = [];
  let inFlight = 0;
  const api = {
    calls: base.calls,
    maxInFlight: 0,
    waiting,
    listSitemapChildren: (request) =>
      new Promise((resolve) => {
        inFlight++;
        api.maxInFlight = Math.max(api.maxInFlight, inFlight);
        waiting.push(() => {
          inFlight--;
          resolve(base.listSitemapChildren(request));
        });
      }),
    async releaseAll() {
      while (waiting.length) {
        waiting.shift()();
        await new Promise((r) => setTimeout(r, 0));
      }
    },
  };
  return api;
}

const TREE = {
  "": [child(API, 5, { hasChildren: true })],
  [API]: [child(V2, 5, { hasChildren: true }), child(`${API}/v1`, 3, { hasChildren: true })],
  [V2]: [child(`${V2}/users`, 4)],
  [`${API}/v1`]: [child(`${API}/v1/items`, 3)],
};

async function openTree(api) {
  const store = createSitemapStore(api);
  store.setContext(LIVE);
  await api.releaseAll();
  for (const name of [API, V2, `${API}/v1`]) {
    store.toggle(name);
    await api.releaseAll();
  }
  return store;
}

test("a reload shows each level's old counts as stale until its own read lands", async () => {
  const api = gatedApi(fakeApi({ tree: TREE }));
  const store = await openTree(api);
  store.setContext({ ...LIVE, query: "note:*", asOf: "pair-9" });
  const stale = () => sitemapRows(get(store)).filter((r) => r.kind === "node" && r.stale).map((r) => r.node.Segment);
  assert.deepEqual(stale(), [API, "v2", "users", "v1", "items"], "every loaded count is stale at first");
  api.waiting.shift()();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(stale().length, 4, "one level's counts are fresh once its read lands");
  await api.releaseAll();
  assert.deepEqual(stale(), []);
});

test("showing more of a level doesn't mark its counts stale", async () => {
  const api = fakeApi({ tree: { "": [child(API, 5, { hasChildren: true })], [API]: many(API, FETCH_SIZE + 20) } });
  const store = await loadedStore(api);
  store.toggle(API);
  await store.settled();
  for (let i = 0; i < Math.ceil(FETCH_SIZE / STEP); i++) store.showMore(API);
  assert.ok(sitemapRows(get(store)).every((r) => !r.stale));
  await store.settled();
});

test("a reload reads one level at a time, the levels in view first and deepest first", async () => {
  const api = gatedApi(fakeApi({ tree: TREE }));
  const store = await openTree(api);
  const before = api.calls.length;
  api.maxInFlight = 0;
  store.setVisible([`${API}/v1`, ""]);
  store.setContext({ ...LIVE, query: "note:*", asOf: "pair-9" });
  await api.releaseAll();
  assert.equal(api.maxInFlight, 1, "one read at a time");
  assert.deepEqual(
    api.calls.slice(before).map((c) => c.Node),
    [`${API}/v1`, "", V2, API],
    "in view first, deepest first, then the rest deepest first",
  );
});

test("a newer reload skips the older one's reads that haven't started", async () => {
  const api = gatedApi(fakeApi({ tree: TREE }));
  const store = await openTree(api);
  const before = api.calls.length;
  store.setContext({ ...LIVE, query: "a:*", asOf: "pair-9" });
  store.setContext({ ...LIVE, query: "b:*", asOf: "pair-9" });
  await api.releaseAll();
  const queries = api.calls.slice(before).map((c) => c.Query);
  assert.equal(queries.filter((q) => q === "a:*").length, 1, "only the read already sent for a:*");
  assert.equal(queries.filter((q) => q === "b:*").length, 4);
  assert.deepEqual(sitemapRows(get(store)).filter((r) => r.stale), []);
});
