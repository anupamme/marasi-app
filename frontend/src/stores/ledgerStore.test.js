import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import {
  createLedgerStore,
  indexWarning,
  isQueryActive,
  ledgerPagination,
  markQueryError,
  matchCountLabel,
  needsOlderPage,
  shownRows,
} from "./createLedgerStore.js";

// An in-memory backend: the live view, the stored content-type exclusion and
// query results by query text. Writes are recorded in `api.calls`.
function fakeApi({ liveView = [], exclusion = [], results = {}, counts = {} } = {}) {
  const calls = [];
  const api = {
    calls,
    getLiveView: async () => liveView.map((pair) => ({ ...pair })),
    getExclusion: async () => [...exclusion],
    setExclusion: async (types) => {
      calls.push(["setExclusion", types]);
      exclusion = [...types];
    },
    queryTraffic: async (query, cursor) => {
      calls.push(["queryTraffic", query, cursor]);
      const pages = results[query];
      if (typeof pages === "function") return pages(cursor);
      return pages ?? { Items: [], NextCursor: null, IndexComplete: true };
    },
    countTraffic: async (query, after) => {
      calls.push(["countTraffic", query, after]);
      const count = counts[query];
      if (count instanceof Error) throw count;
      return count ?? { Count: 0, Capped: false, IndexComplete: true };
    },
  };
  return api;
}

const pair = (id, extra = {}) => ({ ID: id, Method: "GET", Path: `/${id}`, ...extra });

test("populate loads the live view and the content-type exclusion", async () => {
  const store = createLedgerStore(
    fakeApi({ liveView: [pair("a"), pair("b")], exclusion: ["image/png"] }),
  );
  await store.populate();
  const state = get(store);
  assert.deepEqual(
    shownRows(state).map((row) => row.ID),
    ["a", "b"],
  );
  assert.deepEqual(state.exclusion, ["image/png"]);
  assert.equal(store.pairNumber("b"), 2);
  assert.equal(store.pairNumber("zzz"), "?");
});

test("a request joins the live view on flush and its response fills it in", async () => {
  const store = createLedgerStore(fakeApi({ liveView: [pair("a")] }));
  await store.populate();

  store.onRequest(pair("b"));
  assert.equal(shownRows(get(store)).length, 1, "events wait for the flush");
  store.flush();
  assert.deepEqual(
    shownRows(get(store)).map((row) => row.ID),
    ["a", "b"],
  );
  assert.equal(store.pairNumber("b"), 2);

  store.onResponse({ ID: "b", Status: "200 OK", Length: 12 });
  store.flush();
  const b = store.findShownPair("b");
  assert.equal(b.Status, "200 OK");
  assert.equal(b.Path, "/b");
});

test("a request and its response in one flush arrive as one row", () => {
  const store = createLedgerStore(fakeApi());
  store.onRequest(pair("a"));
  store.onResponse({ ID: "a", Status: "404 Not Found" });
  store.flush();
  assert.deepEqual(shownRows(get(store)), [
    { ...pair("a"), Status: "404 Not Found" },
  ]);
});

test("a response fills in a loaded query result without moving rows", async () => {
  const store = createLedgerStore(
    fakeApi({
      results: {
        "host = x": { Items: [pair("b"), pair("a")], NextCursor: null, IndexComplete: true },
      },
    }),
  );
  await store.runQuery("host = x");
  store.onResponse({ ID: "a", Status: "500 Internal Server Error" });
  store.flush();
  const rows = shownRows(get(store));
  assert.deepEqual(
    rows.map((row) => row.ID),
    ["b", "a"],
  );
  assert.equal(rows[1].Status, "500 Internal Server Error");
});

test("running a query shows its results, and clearing it returns to the live view", async () => {
  const api = fakeApi({
    liveView: [pair("a"), pair("b"), pair("c")],
    results: {
      'method = "POST"': { Items: [pair("c"), pair("a")], NextCursor: null, IndexComplete: false },
    },
  });
  const store = createLedgerStore(api);
  await store.populate();
  store.setQueryText('method = "POST"');
  await store.runQuery();

  let state = get(store);
  assert.ok(isQueryActive(state.query));
  assert.deepEqual(
    shownRows(state).map((row) => row.ID),
    ["c", "a"],
  );
  assert.equal(matchCountLabel(state.query), "2 matches");
  assert.match(indexWarning(state.query), /Indexing older traffic/);
  // Request numbers stay the live view's.
  assert.equal(store.pairNumber("c"), 3);
  assert.equal(store.shownPairAtNumber(2), undefined, "b doesn't match");
  assert.equal(store.shownPairAtNumber(3).ID, "c");
  assert.deepEqual(api.calls, [["queryTraffic", 'method = "POST"', ""]]);

  store.clearQuery();
  state = get(store);
  assert.equal(state.queryText, "");
  assert.equal(isQueryActive(state.query), false);
  assert.deepEqual(
    shownRows(state).map((row) => row.ID),
    ["a", "b", "c"],
  );
});

test("an invalid query records the error with its position and keeps the earlier results", async () => {
  const store = createLedgerStore(
    fakeApi({
      results: {
        "host = x": { Items: [pair("a")], NextCursor: null, IndexComplete: true },
        "host = ": {
          QueryError: { Message: "expected a value", Position: 8 },
        },
      },
    }),
  );
  await store.runQuery("host = x");
  await store.runQuery("host = ");

  const { query } = get(store);
  assert.deepEqual(query.error, {
    query: "host = ",
    message: "expected a value",
    position: 8,
  });
  assert.equal(query.ranQuery, "host = x");
  assert.deepEqual(
    query.items.map((row) => row.ID),
    ["a"],
  );
  assert.deepEqual(markQueryError(query.error), {
    before: "host = ",
    at: " ",
    after: "",
  });

  await store.runQuery("host = x");
  assert.equal(get(store).query.error, null);
});

test("paging past the loaded query results loads the next older page", async () => {
  const pages = {
    "": { Items: [pair("e"), pair("d")], NextCursor: "d", IndexComplete: true },
    d: { Items: [pair("c"), pair("b")], NextCursor: "b", IndexComplete: true },
    b: { Items: [pair("a")], NextCursor: null, IndexComplete: true },
  };
  const api = fakeApi({ results: { "host = x": (cursor) => pages[cursor] } });
  const store = createLedgerStore(api);
  await store.runQuery("host = x");
  store.setPagination((old) => ({ ...old, pageSize: 2 }));

  let state = get(store);
  assert.equal(matchCountLabel(state.query), "2+ matches");
  assert.ok(needsOlderPage(state.query, ledgerPagination(state).pageIndex, 2));

  await store.loadOlderPage();
  state = get(store);
  assert.deepEqual(
    shownRows(state).map((row) => row.ID),
    ["e", "d", "c", "b"],
  );
  assert.equal(
    needsOlderPage(state.query, ledgerPagination(state).pageIndex, 2),
    false,
    "page 1 of 2 still has a loaded page after it",
  );

  store.setPagination((old) => ({ ...old, pageIndex: 1 }));
  await store.loadOlderPage();
  state = get(store);
  assert.deepEqual(
    shownRows(state).map((row) => row.ID),
    ["e", "d", "c", "b", "a"],
  );
  assert.equal(state.query.nextCursor, null);
  assert.deepEqual(
    api.calls.map((call) => call[2]),
    ["", "d", "b"],
  );
});

test("each mode keeps its own page and they share the rows per page", async () => {
  const store = createLedgerStore(
    fakeApi({
      results: { "host = x": { Items: [pair("a")], NextCursor: null, IndexComplete: true } },
    }),
  );
  store.setPagination({ pageIndex: 3, pageSize: 50 });
  await store.runQuery("host = x");
  assert.deepEqual(ledgerPagination(get(store)), { pageIndex: 0, pageSize: 50 });

  store.setPagination((old) => ({ ...old, pageIndex: 1, pageSize: 20 }));
  store.clearQuery();
  assert.deepEqual(ledgerPagination(get(store)), { pageIndex: 3, pageSize: 20 });
});

test("new matches wait until merged, then join the results newest first", async () => {
  const pages = [
    { Items: [pair("b"), pair("a")], NextCursor: null, IndexComplete: true },
    { Items: [pair("d"), pair("c"), pair("b")], NextCursor: null, IndexComplete: true },
  ];
  const store = createLedgerStore(fakeApi({ results: { "host = x": () => pages.shift() } }));
  await store.runQuery("host = x");

  await store.checkForNewMatches();
  assert.equal(pages.length, 1, "no traffic, no check");

  store.onRequest(pair("d"));
  store.flush();
  await store.checkForNewMatches();
  let { query } = get(store);
  assert.deepEqual(
    query.newMatches.map((row) => row.ID),
    ["d", "c"],
  );
  assert.deepEqual(
    query.items.map((row) => row.ID),
    ["b", "a"],
  );

  store.mergeNewMatches();
  query = get(store).query;
  assert.deepEqual(
    query.items.map((row) => row.ID),
    ["d", "c", "b", "a"],
  );
  assert.deepEqual(query.newMatches, []);
});

test("new matches are told apart from older pages by the oldest loaded pair, not the opaque cursor", async () => {
  const pages = [
    { Items: [pair("d"), pair("c")], NextCursor: "opaque-token", IndexComplete: true },
    { Items: [pair("e"), pair("d"), pair("c")], NextCursor: "opaque-token-2", IndexComplete: true },
  ];
  const store = createLedgerStore(fakeApi({ results: { "host = x": () => pages.shift() } }));
  await store.runQuery("host = x");
  store.markTrafficChanged();
  await store.checkForNewMatches();
  assert.deepEqual(
    get(store).query.newMatches.map((row) => row.ID),
    ["e"],
  );
});

test("saving the exclusion stores it and runs the active query again", async () => {
  const api = fakeApi({
    results: { "host = x": { Items: [pair("a")], NextCursor: null, IndexComplete: true } },
  });
  const store = createLedgerStore(api);
  await store.runQuery("host = x");
  await store.saveExclusion(["image/png"]);
  assert.deepEqual(get(store).exclusion, ["image/png"]);
  assert.deepEqual(api.calls, [
    ["queryTraffic", "host = x", ""],
    ["setExclusion", ["image/png"]],
    ["queryTraffic", "host = x", ""],
  ]);
});

test("a metadata patch reaches the live view and the query results", async () => {
  const store = createLedgerStore(
    fakeApi({
      liveView: [pair("a")],
      results: { "host = x": { Items: [pair("a")], NextCursor: null, IndexComplete: true } },
    }),
  );
  await store.populate();
  await store.runQuery("host = x");
  store.patchMetadata("a", { has_note: 1 });
  const state = get(store);
  assert.equal(state.items[0].Metadata.has_note, 1);
  assert.equal(state.query.items[0].Metadata.has_note, 1);
});

test("clearing for another project drops a live view still loading", async () => {
  let release;
  const api = fakeApi();
  api.getLiveView = () => new Promise((resolve) => (release = resolve));
  const store = createLedgerStore(api);
  const loading = store.populate();
  store.clear();
  release([pair("old")]);
  await loading;
  assert.deepEqual(get(store).items, []);
});

test("toggling a query term adds it to the query box and runs the query", async () => {
  const api = fakeApi({
    results: { "host = x note:*": { Items: [pair("a")], NextCursor: null, IndexComplete: true } },
  });
  const store = createLedgerStore(api);
  store.setQueryText("host = x");
  await store.toggleQueryTerm("note:*");
  const state = get(store);
  assert.equal(state.queryText, "host = x note:*");
  assert.equal(state.query.ranQuery, "host = x note:*");
  assert.deepEqual(shownRows(state).map((row) => row.ID), ["a"]);
});

test("toggling the query's only term off returns to the live view", async () => {
  const store = createLedgerStore(fakeApi({ liveView: [pair("a"), pair("b")] }));
  await store.populate();
  await store.toggleQueryTerm("finding:*");
  await store.toggleQueryTerm("finding:*");
  const state = get(store);
  assert.equal(state.queryText, "");
  assert.ok(!isQueryActive(state.query));
});

test("counting queries reads each count, capped, and marks a failed one null", async () => {
  const api = fakeApi({
    counts: {
      "note:*": { Count: 3, Capped: false, IndexComplete: true },
      "finding:*": { Count: 100000, Capped: true, IndexComplete: true },
      "test_case:*": { Count: 0, Capped: false, IndexComplete: true, QueryError: { Message: "bad", Position: 1 } },
      "launchpad:*": new Error("no project"),
    },
  });
  const store = createLedgerStore(api);
  const counts = await store.countQueries(["note:*", "finding:*", "test_case:*", "launchpad:*"]);
  assert.deepEqual(counts, {
    "note:*": { count: 3, capped: false },
    "finding:*": { count: 100000, capped: true },
    "test_case:*": null,
    "launchpad:*": null,
  });
  assert.ok(api.calls.some(([name, query, after]) => name === "countTraffic" && query === "note:*" && after === ""));
});
