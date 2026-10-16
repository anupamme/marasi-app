// Highlights on the Ledger's pairs: one bulk call on the selection, the
// count Marasi returns, and the loaded rows repainted without a reload.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { createLedgerStore, shownRows } from "./createLedgerStore.js";

function fakeApi({ liveView = [], results = {}, changed = 0 } = {}) {
  const calls = [];
  return {
    calls,
    getLiveView: async () => {
      calls.push(["getLiveView"]);
      return liveView.map((pair) => ({ ...pair }));
    },
    getExclusion: async () => [],
    hasOwnExclusion: async () => false,
    queryTraffic: async (query, cursor) => {
      calls.push(["queryTraffic", query, cursor]);
      return results[query] ?? { Items: [], NextCursor: null, IndexComplete: true };
    },
    setHighlight: async (selection, highlight) => {
      calls.push(["setHighlight", selection, highlight]);
      return changed;
    },
    clearHighlight: async (selection) => {
      calls.push(["clearHighlight", selection]);
      return changed;
    },
  };
}

const pair = (id, extra = {}) => ({ ID: id, Method: "GET", Path: `/${id}`, ...extra });
const highlights = (store) =>
  Object.fromEntries(shownRows(get(store)).map((row) => [row.ID, row.Highlight ?? null]));

test("highlighting the selection makes one bulk call and reports Marasi's count", async () => {
  const ids = Array.from({ length: 10_000 }, (_, i) => `p${i}`);
  const api = fakeApi({ liveView: ids.map((id) => pair(id)), changed: 9_998 });
  const store = createLedgerStore(api);
  await store.populate();

  const count = await store.setHighlight(ids, 3);

  assert.equal(count, 9_998);
  assert.deepEqual(api.calls.filter(([name]) => name === "setHighlight"), [["setHighlight", { ids }, 3]]);
  assert.ok(shownRows(get(store)).every((row) => row.Highlight === 3));
});

test("highlighting repaints the live view and loaded query results", async () => {
  const api = fakeApi({
    liveView: [pair("a"), pair("b"), pair("c", { Highlight: 2 })],
    results: { "method = GET": { Items: [pair("b"), pair("a")], NextCursor: null, IndexComplete: true } },
    changed: 1,
  });
  const store = createLedgerStore(api);
  await store.populate();
  await store.runQuery("method = GET");

  await store.setHighlight(["b"], 7);

  assert.deepEqual(highlights(store), { b: 7, a: null });
  store.clearQuery();
  assert.deepEqual(highlights(store), { c: 2, b: 7, a: null });
});

test("None clears the selection's highlights", async () => {
  const api = fakeApi({ liveView: [pair("a", { Highlight: 4 }), pair("b", { Highlight: 1 })], changed: 2 });
  const store = createLedgerStore(api);
  await store.populate();

  const count = await store.setHighlight(["a", "b"], null);

  assert.equal(count, 2);
  assert.deepEqual(api.calls.at(-1), ["clearHighlight", { ids: ["a", "b"] }]);
  assert.deepEqual(highlights(store), { b: null, a: null });
});

test("a failed highlight leaves the rows as they were", async () => {
  const api = fakeApi({ liveView: [pair("a", { Highlight: 4 })] });
  api.setHighlight = async () => {
    throw new Error("database is locked");
  };
  const store = createLedgerStore(api);
  await store.populate();

  await assert.rejects(store.setHighlight(["a"], 2), /locked/);
  assert.deepEqual(highlights(store), { a: 4 });
});

test("refreshing reloads the live view and reruns the active query", async () => {
  const api = fakeApi({ liveView: [pair("a")] });
  const store = createLedgerStore(api);
  await store.populate();
  await store.runQuery("host = x");
  api.calls.length = 0;

  await store.refresh();

  assert.deepEqual(api.calls, [
    ["getLiveView"],
    ["queryTraffic", "host = x", ""],
  ]);
});
