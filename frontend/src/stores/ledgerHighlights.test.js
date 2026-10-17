// Highlights on the Ledger's pairs: one bulk call on the selection, the
// count Marasi returns, and the loaded rows repainted in place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { createLedgerStore, tableRows } from "./createLedgerStore.js";

// One page of results per query text, newest first; "" is the live view.
function fakeApi({ traffic = [], queries = {}, changed = 0 } = {}) {
  const calls = [];
  const match = (text) => (text === "" ? () => true : queries[text]);
  return {
    calls,
    getExclusion: async () => [],
    hasOwnExclusion: async () => false,
    queryTraffic: async (req) => {
      calls.push(["queryTraffic", req.Query]);
      const items = traffic.filter(match(req.Query)).map((pair) => ({ ...pair }));
      return { Items: items, NextCursor: null, PrevCursor: null, AsOf: "p9", IndexComplete: true };
    },
    countTraffic: async () => ({ Count: traffic.length, Capped: false, IndexComplete: true }),
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
  Object.fromEntries(tableRows(get(store)).map((row) => [row.ID, row.Highlight ?? null]));

test("highlighting the selection makes one bulk call and reports Marasi's count", async () => {
  const ids = Array.from({ length: 10_000 }, (_, i) => `p${i}`);
  const api = fakeApi({ traffic: ids.slice(0, 200).map((id) => pair(id)), changed: 9_998 });
  const store = createLedgerStore(api);
  await store.populate();

  const count = await store.setHighlight(ids, 3);

  assert.equal(count, 9_998);
  assert.deepEqual(api.calls.filter(([name]) => name === "setHighlight"), [["setHighlight", { ids }, 3]]);
  assert.ok(tableRows(get(store)).every((row) => row.Highlight === 3));
});

test("highlighting repaints loaded rows in place, even ones that stop matching", async () => {
  const api = fakeApi({
    traffic: [pair("c", { Highlight: 2 }), pair("b", { Highlight: 2 }), pair("a")],
    queries: { "highlight = 2": (p) => p.Highlight === 2 },
    changed: 1,
  });
  const store = createLedgerStore(api);
  await store.populate();
  await store.runQuery("highlight = 2");

  await store.setHighlight(["b"], 7);

  assert.deepEqual(highlights(store), { c: 2, b: 7 });
  assert.equal(api.calls.filter(([name]) => name === "queryTraffic").length, 2, "no reload");
});

test("None clears the selection's highlights", async () => {
  const api = fakeApi({ traffic: [pair("b", { Highlight: 4 }), pair("a", { Highlight: 1 })], changed: 2 });
  const store = createLedgerStore(api);
  await store.populate();

  const count = await store.setHighlight(["a", "b"], null);

  assert.equal(count, 2);
  assert.deepEqual(api.calls.at(-1), ["clearHighlight", { ids: ["a", "b"] }]);
  assert.deepEqual(highlights(store), { b: null, a: null });
});

test("a failed highlight leaves the rows as they were", async () => {
  const api = fakeApi({ traffic: [pair("a", { Highlight: 4 })] });
  api.setHighlight = async () => {
    throw new Error("database is locked");
  };
  const store = createLedgerStore(api);
  await store.populate();

  await assert.rejects(store.setHighlight(["a"], 2), /locked/);
  assert.deepEqual(highlights(store), { a: 4 });
});

test("highlighting repaints the drawer's pair when a jump opened it outside the loaded rows", async () => {
  const api = fakeApi({ traffic: [pair("b"), pair("a")], changed: 1 });
  api.queryTraffic = async (req) => {
    if (req.Query.startsWith("number")) return { Items: [pair("z", { Number: 9 })], NextCursor: null, AsOf: "p9", IndexComplete: true };
    return { Items: [pair("b"), pair("a")], NextCursor: null, PrevCursor: null, AsOf: "p9", IndexComplete: true };
  };
  const store = createLedgerStore(api);
  await store.populate();
  await store.sortBy("host");
  await store.goToNumber(9);
  await store.setHighlight(["z"], 4);
  assert.equal(get(store).focusRow.Highlight, 4);
});
