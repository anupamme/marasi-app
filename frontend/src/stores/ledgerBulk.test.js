// Ledger selections as Marasi defines them (ADR-0033), and the bulk actions
// that run on them: a selection is the listed pair ids, or after ⌘A the
// query, the exclusion and the results' as_of, and never ids for "all".
import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import {
  allSelectedLabel,
  createLedgerStore,
  isAllSelected,
  selectionSize,
  selectionSpec,
  tableRows,
} from "./createLedgerStore.js";

// Pair IDs sort by capture time, as Marasi's UUIDv7 ids do.
const idOf = (n) => `p${String(n).padStart(4, "0")}`;
const pair = (n, extra = {}) => ({ ID: idOf(n), Number: n, Method: "GET", Host: "api.acme.test", Path: `/${n}`, ...extra });

// An in-memory Marasi: one page newest first under as_of, queries as
// predicates by text, CountTraffic, and the bulk operations, which record
// their selection and return `changed` (default: the selection's size).
function fakeApi({ traffic = [], exclusion = [], queries = {}, changed } = {}) {
  const calls = [];
  const db = traffic.map((p) => ({ ...p }));
  const newest = () => db.reduce((max, p) => (p.ID > max ? p.ID : max), "");
  const match = (text) => (text === "" ? () => true : queries[text]);
  const hidden = (p) => exclusion.includes(p.ContentType);
  const inSelection = (sel) =>
    sel.ids
      ? db.filter((p) => sel.ids.includes(p.ID))
      : db.filter((p) => p.ID <= sel.as_of && match(sel.query)(p) && !sel.exclusion.includes(p.ContentType));
  const bulk = (name) => async (sel, ...args) => {
    calls.push([name, structuredClone(sel), ...args]);
    return changed ?? inSelection(sel).length;
  };
  return {
    calls,
    db,
    capture: (p) => db.push({ ...p }),
    getExclusion: async () => [...exclusion],
    hasOwnExclusion: async () => true,
    queryTraffic: async (req) => {
      calls.push(["queryTraffic", { ...req }]);
      const asOf = req.AsOf || newest();
      const rows = db
        .filter((p) => p.ID <= asOf && match(req.Query)(p) && !hidden(p))
        .sort((a, b) => (a.ID < b.ID ? 1 : -1));
      return { Items: rows.map((p) => ({ ...p })), NextCursor: null, PrevCursor: null, AsOf: asOf || null, IndexComplete: true };
    },
    countTraffic: async (query, after, options = {}) => {
      calls.push(["countTraffic", query, after, { ...options }]);
      const count = db.filter(
        (p) =>
          match(query)(p) &&
          !hidden(p) &&
          (!options.AsOf || p.ID <= options.AsOf) &&
          (!after || p.ID > after),
      ).length;
      return { Count: count, Capped: false, IndexComplete: true };
    },
    createLaunchpad: async (name, description) => {
      calls.push(["createLaunchpad", name, description]);
      return "lp1";
    },
    setHighlight: bulk("setHighlight"),
    clearHighlight: bulk("clearHighlight"),
    linkTraffic: bulk("linkTraffic"),
    unlinkTraffic: bulk("unlinkTraffic"),
    appendNote: bulk("appendNote"),
    clearNotes: bulk("clearNotes"),
    deleteTraffic: async (sel) => {
      const gone = inSelection(sel).map((p) => p.ID);
      calls.push(["deleteTraffic", structuredClone(sel)]);
      for (const id of gone) db.splice(db.findIndex((p) => p.ID === id), 1);
      return gone.length;
    },
  };
}

async function storeWith(options = {}) {
  const api = fakeApi({ traffic: [1, 2, 3, 4].map((n) => pair(n)), ...options });
  const store = createLedgerStore(api);
  await store.populate();
  return { store, api };
}

const bulkCalls = (api) =>
  api.calls.filter(([name]) => !["queryTraffic", "countTraffic", "createLaunchpad"].includes(name));
const pageReads = (api) => api.calls.filter(([name]) => name === "queryTraffic").length;
const selected = (store) => [...get(store).selection.ids].sort();

test("a selection of rows is their ids", async () => {
  const { store } = await storeWith();
  store.clickRow(idOf(2));
  store.clickRow(idOf(4), { toggle: true });
  const state = get(store);
  assert.deepEqual(selectionSpec(state), { ids: [idOf(2), idOf(4)] });
  assert.equal(isAllSelected(state), false);
  assert.equal(selectionSize(state), 2);
  assert.equal(allSelectedLabel(state), "");
});

test("nothing selected has no selection", async () => {
  const { store } = await storeWith();
  assert.equal(selectionSpec(get(store)), null);
});

test("⌘A selects the whole query up to the results' as_of, never ids", async () => {
  const queries = { "host:api": (p) => p.Host === "api.acme.test" };
  const { store, api } = await storeWith({
    traffic: [pair(1), pair(2, { Host: "www.acme.test" }), pair(3), pair(4, { ContentType: "image/png" })],
    exclusion: ["image/png"],
    queries,
  });
  await store.runQuery("host:api");
  store.selectAll();
  await store.settled();

  const state = get(store);
  assert.equal(isAllSelected(state), true);
  assert.deepEqual(selectionSpec(state), { query: "host:api", exclusion: ["image/png"], as_of: idOf(4) });
  assert.deepEqual(selected(store), [idOf(1), idOf(3)], "the loaded rows show as selected");
  assert.equal(state.selection.focus, idOf(3), "the top row is focused");
  assert.deepEqual(api.calls.at(-1), ["countTraffic", "host:api", "", { AsOf: idOf(4) }]);
  assert.equal(selectionSize(state), 2);
  assert.equal(allSelectedLabel(state), "All 2 matching selected");
});

test("⌘A in the live view selects it with an empty query", async () => {
  const { store } = await storeWith();
  store.selectAll();
  await store.settled();
  assert.deepEqual(selectionSpec(get(store)), { query: "", exclusion: [], as_of: idOf(4) });
  assert.equal(allSelectedLabel(get(store)), "All 4 matching selected");
});

test("new matches stay out of a ⌘A selection, and the status bar says so", async () => {
  const queries = { all: () => true };
  const { store, api } = await storeWith({ queries });
  await store.runQuery("all");
  store.selectAll();
  await store.settled();

  api.capture(pair(5));
  api.capture(pair(6));
  await store.countNewMatches();
  assert.equal(allSelectedLabel(get(store)), "All 4 matching selected · 2 new matches not included");

  await store.showNewMatches();
  const state = get(store);
  assert.equal(tableRows(state).length, 6);
  assert.deepEqual(selectionSpec(state).as_of, idOf(4), "the selection keeps its as_of");
  assert.deepEqual(selected(store), [1, 2, 3, 4].map(idOf), "shown new matches aren't selected");
  assert.equal(allSelectedLabel(state), "All 4 matching selected · 2 new matches not included");

  await store.addToLaunchpad(selectionSpec(state), "L");
  assert.deepEqual(bulkCalls(api), [
    ["linkTraffic", { query: "all", exclusion: [], as_of: idOf(4) }, { Kind: "launchpad", ID: "L" }],
  ]);
});

test("new pairs at the top of the live view stay out of a ⌘A selection", async () => {
  const { store } = await storeWith();
  store.selectAll();
  await store.settled();
  store.onRequest(pair(5));
  store.flush();
  const state = get(store);
  assert.equal(tableRows(state)[0].ID, idOf(5));
  assert.equal(state.selection.ids.has(idOf(5)), false);
  assert.equal(allSelectedLabel(state), "All 4 matching selected · 1 new match not included");
});

test("a click after ⌘A goes back to listed ids", async () => {
  const { store } = await storeWith();
  store.selectAll();
  store.clickRow(idOf(2));
  assert.deepEqual(selectionSpec(get(store)), { ids: [idOf(2)] });
  store.selectAll();
  store.clickRow(idOf(2), { toggle: true });
  assert.deepEqual(selectionSpec(get(store)), { ids: [idOf(4), idOf(3), idOf(1)] }, "⌘-click leaves out that row");
});

test("focusing a pair or right-clicking keeps a ⌘A selection", async () => {
  const { store } = await storeWith();
  store.selectAll();
  store.focusPair(idOf(2));
  store.contextRow(idOf(3));
  assert.equal(isAllSelected(get(store)), true);
  assert.equal(get(store).selection.focus, idOf(3), "the right-clicked row takes the focus");
});

test("running another query ends a ⌘A selection", async () => {
  const { store } = await storeWith({ queries: { one: (p) => p.ID === idOf(1) } });
  store.selectAll();
  await store.runQuery("one");
  assert.equal(selectionSpec(get(store)), null);
});

test("link and unlink run once on the selection and refresh the rows in place", async () => {
  const { store, api } = await storeWith();
  store.clickRow(idOf(1));
  store.clickRow(idOf(3), { toggle: true });
  const sel = selectionSpec(get(store));
  const reset = get(store).results.reset;
  const reads = pageReads(api);

  assert.equal(await store.addToLaunchpad(sel, "L"), 2);
  assert.equal(await store.removeFromLaunchpad(sel, "L"), 2);
  assert.equal(await store.linkToFinding(sel, "F"), 2);
  assert.equal(await store.unlinkFromFinding(sel, "F"), 2);
  assert.equal(await store.linkToTestCase(sel, "T"), 2);
  assert.equal(await store.unlinkFromTestCase(sel, "T"), 2);

  const ids = { ids: [idOf(1), idOf(3)] };
  assert.deepEqual(bulkCalls(api), [
    ["linkTraffic", ids, { Kind: "launchpad", ID: "L" }],
    ["unlinkTraffic", ids, { Kind: "launchpad", ID: "L" }],
    ["linkTraffic", ids, { Kind: "finding", ID: "F" }],
    ["unlinkTraffic", ids, { Kind: "finding", ID: "F" }],
    ["linkTraffic", ids, { Kind: "test_case", ID: "T" }],
    ["unlinkTraffic", ids, { Kind: "test_case", ID: "T" }],
  ]);
  assert.equal(pageReads(api), reads + 6, "each change reads the rows again");
  assert.equal(get(store).results.reset, reset, "without sending the table to the top");
  assert.deepEqual(selected(store), [idOf(1), idOf(3)], "the selection stays");
});

test("a new launchpad links the selection in one call; ⌘A names it for the count", async () => {
  const { store, api } = await storeWith();
  store.selectAll();
  await store.settled();
  const result = await store.sendToNewLaunchpad(selectionSpec(get(store)), selectionSize(get(store)));
  assert.deepEqual(result, { launchpadId: "lp1", count: 4 });
  assert.deepEqual(api.calls.filter(([name]) => name === "createLaunchpad"), [
    ["createLaunchpad", "4 requests", "Launchpad for 4 requests"],
  ]);
  assert.deepEqual(bulkCalls(api), [
    ["linkTraffic", { query: "", exclusion: [], as_of: idOf(4) }, { Kind: "launchpad", ID: "lp1" }],
  ]);
});

test("a new launchpad for listed pairs is named after their request numbers", async () => {
  const { store, api } = await storeWith();
  store.clickRow(idOf(3));
  await store.sendToNewLaunchpad(selectionSpec(get(store)));
  assert.deepEqual(api.calls.filter(([name]) => name === "createLaunchpad"), [
    ["createLaunchpad", "Request 3", "Launchpad for Request 3"],
  ]);
});

test("one launchpad each links each pair on its own", async () => {
  const { store, api } = await storeWith();
  const result = await store.sendToLaunchpadsEach([idOf(1)]);
  assert.deepEqual(result, { launchpadIds: ["lp1"], done: 1, failed: 0 });
  assert.deepEqual(bulkCalls(api), [["linkTraffic", { ids: [idOf(1)] }, { Kind: "launchpad", ID: "lp1" }]]);
  const tooMany = Array.from({ length: 26 }, (_, i) => idOf(i));
  await assert.rejects(store.sendToLaunchpadsEach(tooMany), /25/);
});

test("notes: append and clear run on the selection and return Marasi's count", async () => {
  const { store, api } = await storeWith({ changed: 1 });
  store.selectAll();
  const sel = selectionSpec(get(store));
  assert.equal(await store.appendNote(sel, "checked"), 1);
  assert.equal(await store.clearNotes(sel), 1);
  assert.deepEqual(bulkCalls(api), [
    ["appendNote", { query: "", exclusion: [], as_of: idOf(4) }, "checked"],
    ["clearNotes", { query: "", exclusion: [], as_of: idOf(4) }],
  ]);
});

test("deleting removes the pairs, clears the selection and refreshes the rows", async () => {
  const { store, api } = await storeWith();
  store.clickRow(idOf(2));
  store.clickRow(idOf(3), { toggle: true });
  assert.equal(await store.deleteFromProject(selectionSpec(get(store))), 2);
  const state = get(store);
  assert.deepEqual(tableRows(state).map((row) => row.ID), [idOf(4), idOf(1)]);
  assert.equal(selectionSpec(state), null);
  assert.equal(state.results.count.count, 2, "the count follows");
  assert.deepEqual(bulkCalls(api), [["deleteTraffic", { ids: [idOf(2), idOf(3)] }]]);
});

test("a failed bulk operation rejects and changes nothing", async () => {
  const { store, api } = await storeWith();
  api.clearNotes = async () => {
    throw new Error("disk full");
  };
  store.clickRow(idOf(2));
  await assert.rejects(store.clearNotes(selectionSpec(get(store))), /disk full/);
  assert.deepEqual(selected(store), [idOf(2)]);
});

test("finding evidence: listed pairs check the findings, ⌘A counts the query's linked pairs", async () => {
  const { store, api } = await storeWith();
  const findings = [{ ID: "F1", Requests: [idOf(1), idOf(2)] }, { ID: "F2", Requests: [idOf(2)] }];
  assert.equal(await store.findingEvidence({ ids: [idOf(2), idOf(3)] }, findings), 1);

  api.countTraffic = async (query, after, options) => {
    api.calls.push(["countTraffic", query, after, options]);
    return { Count: 3, Capped: false };
  };
  assert.equal(await store.findingEvidence({ query: "", exclusion: [], as_of: idOf(4) }, findings), 3);
  assert.equal(await store.findingEvidence({ query: "a OR b", exclusion: [], as_of: idOf(4) }, findings), 3);
  assert.deepEqual(api.calls.slice(-2), [
    ["countTraffic", "finding:*", "", { AsOf: idOf(4) }],
    ["countTraffic", "(a OR b) AND finding:*", "", { AsOf: idOf(4) }],
  ]);
});

test("a highlight on a ⌘A selection goes to Marasi as the query and paints the loaded rows", async () => {
  const { store, api } = await storeWith();
  store.selectAll();
  await store.settled();
  store.onRequest(pair(5));
  store.flush();
  const sel = selectionSpec(get(store));
  assert.equal(await store.setHighlight(sel, 3), 4);
  assert.deepEqual(bulkCalls(api), [["setHighlight", { query: "", exclusion: [], as_of: idOf(4) }, 3]]);
  const highlights = Object.fromEntries(tableRows(get(store)).map((row) => [row.ID, row.Highlight ?? null]));
  assert.deepEqual(highlights, { [idOf(5)]: null, [idOf(4)]: 3, [idOf(3)]: 3, [idOf(2)]: 3, [idOf(1)]: 3 });

  await store.setHighlight(sel, null);
  assert.deepEqual(bulkCalls(api).at(-1), ["clearHighlight", { query: "", exclusion: [], as_of: idOf(4) }]);
  assert.ok(tableRows(get(store)).every((row) => (row.Highlight ?? null) === null));
});
