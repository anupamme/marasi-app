// The Ledger's layout state in the store: the selection the drawer follows,
// the drawer's size, and the sitemap dock's size.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import {
  createLedgerStore,
  drawerKeybindingState,
  focusedPair,
  hiddenByTypeCount,
  isDrawerOpen,
  tableRows,
} from "./createLedgerStore.js";

// One page of the live view (oldest first in `liveView`, listed newest
// first without the excluded types), or of a query's `results`.
function fakeApi({ liveView = [], exclusion = [], results = {} } = {}) {
  const listed = () =>
    [...liveView].reverse().filter((pair) => !exclusion.includes(pair.ContentType));
  return {
    getExclusion: async () => [...exclusion],
    hasOwnExclusion: async () => true,
    setExclusion: async (types) => {
      exclusion = [...types];
    },
    queryTraffic: async ({ Query }) =>
      Query === ""
        ? { Items: listed().map((pair) => ({ ...pair })), NextCursor: null, AsOf: "z" }
        : results[Query] ?? { Items: [], NextCursor: null, IndexComplete: true },
    countTraffic: async (query, after, { IgnoreExclusion } = {}) => ({
      Count: query === "" ? (IgnoreExclusion ? liveView.length : listed().length) : 0,
      Capped: false,
    }),
  };
}

const pair = (id, extra = {}) => ({ ID: id, Method: "GET", Path: `/${id}`, ...extra });

async function storeWith(liveView, options = {}) {
  const store = createLedgerStore(fakeApi({ liveView, ...options }));
  await store.populate();
  return store;
}

test("selecting a shown pair opens the drawer on it; clearing the selection closes it", async () => {
  const store = await storeWith([pair("a"), pair("b")]);
  assert.equal(isDrawerOpen(get(store)), false);

  store.selectPair("a");
  assert.equal(isDrawerOpen(get(store)), true);
  assert.equal(focusedPair(get(store)).ID, "a");

  store.clearSelection();
  assert.equal(isDrawerOpen(get(store)), false);
  assert.equal(focusedPair(get(store)), undefined);
});

const ids = (rows) => rows.map((row) => row.ID);

test("the table lists the live view newest first without the types the exclusion hides", async () => {
  const store = await storeWith(
    [
      pair("a", { ContentType: "text/html" }),
      pair("b", { ContentType: "image/png" }),
      pair("c", { ContentType: "application/json" }),
    ],
    { exclusion: ["image/png"] },
  );
  assert.deepEqual(ids(tableRows(get(store))), ["c", "a"]);
  assert.equal(hiddenByTypeCount(get(store)), 1);
});

test("the table lists query results as marasi returns them, with no hidden count", async () => {
  const store = await storeWith([pair("a"), pair("b")], {
    results: { x: { Items: [pair("b"), pair("a")], NextCursor: null, IndexComplete: true } },
  });
  await store.runQuery("x");
  assert.deepEqual(ids(tableRows(get(store))), ["b", "a"]);
  assert.equal(hiddenByTypeCount(get(store)), null);
});

test("next and previous move the selection down and up the table and stop at its ends", async () => {
  const store = await storeWith([pair("a"), pair("b"), pair("c")]);
  // The table reads c, b, a.
  store.stepSelection(1);
  assert.equal(get(store).selection.focus, "c", "with nothing selected, next starts at the top");
  store.stepSelection(1);
  assert.equal(get(store).selection.focus, "b");
  store.stepSelection(1);
  store.stepSelection(1);
  assert.equal(get(store).selection.focus, "a", "the bottom row stays selected");
  store.stepSelection(-1);
  assert.equal(get(store).selection.focus, "b");

  store.clearSelection();
  store.stepSelection(-1);
  assert.equal(get(store).selection.focus, "a", "with nothing selected, previous starts at the bottom");
});

test("the drawer closes when its pair leaves the table, and stays while it remains", async () => {
  const store = await storeWith([pair("a"), pair("b", { ContentType: "text/css" })], {
    results: { a: { Items: [pair("a")], NextCursor: null, IndexComplete: true } },
  });
  store.selectPair("a");
  await store.runQuery("a");
  assert.equal(get(store).selection.focus, "a", "the query still lists it");

  await store.clearQuery();
  store.selectPair("b");
  await store.saveExclusion(["text/css"]);
  assert.equal(isDrawerOpen(get(store)), false, "the exclusion hides it");
});

test("a response for the selected pair is kept for the drawer until another pair is selected", async () => {
  const store = await storeWith([pair("a"), pair("b")]);
  store.selectPair("a");
  store.onResponse({ ID: "b", StatusCode: 404 });
  assert.equal(get(store).selection.incomingResponse, null);
  store.onResponse({ ID: "a", StatusCode: 200 });
  assert.equal(get(store).selection.incomingResponse.StatusCode, 200);
  store.selectPair("b");
  assert.equal(get(store).selection.incomingResponse, null);
});

test("the drawer takes 42% of the table area at first and resizes between 15% and 85%", () => {
  const store = createLedgerStore(fakeApi());
  assert.equal(get(store).layout.drawer.split, 0.42);
  store.setDrawerSplit(0.6);
  assert.equal(get(store).layout.drawer.split, 0.6);
  store.setDrawerSplit(0.99);
  assert.equal(get(store).layout.drawer.split, 0.85);
  store.setDrawerSplit(0.01);
  assert.equal(get(store).layout.drawer.split, 0.15);
});

test("maximising toggles while a pair is selected, and clearing the selection restores the table", async () => {
  const store = await storeWith([pair("a")]);
  store.toggleDrawerMaximised();
  assert.equal(get(store).layout.drawer.maximised, false, "no drawer, nothing to maximise");
  store.selectPair("a");
  store.toggleDrawerMaximised();
  assert.equal(get(store).layout.drawer.maximised, true);
  store.toggleDrawerMaximised();
  assert.equal(get(store).layout.drawer.maximised, false);
  store.toggleDrawerMaximised();
  store.clearSelection();
  assert.equal(get(store).layout.drawer.maximised, false);
});

test("the dock starts open at 320px; its width and collapsed state are kept", () => {
  const store = createLedgerStore(fakeApi());
  assert.deepEqual(get(store).layout.dock, { width: 320, collapsed: false });
  store.setDock({ width: 400, collapsed: true });
  assert.deepEqual(get(store).layout.dock, { width: 400, collapsed: true });
  // The dock component reads and writes it as a store of its own.
  store.dockState.set({ width: 300, collapsed: false });
  assert.deepEqual(get(store.dockState), { width: 300, collapsed: false });
});

test("the drawer and dock layout outlast a project switch; the selection doesn't", async () => {
  const store = await storeWith([pair("a")]);
  store.selectPair("a");
  store.setDrawerSplit(0.3);
  store.toggleDrawerMaximised();
  store.setDock({ width: 280, collapsed: true });
  store.clear();
  const state = get(store);
  assert.equal(isDrawerOpen(state), false);
  assert.equal(state.layout.drawer.split, 0.3);
  assert.deepEqual(state.layout.dock, { width: 280, collapsed: true });
});

test("the keybinding drawer state says whether the drawer is open and what the pair is", async () => {
  const store = await storeWith([
    pair("a", { StatusCode: 101, ContentType: "", Metadata: { protocol: "websocket" } }),
  ]);
  assert.deepEqual(drawerKeybindingState(get(store)), { open: false, meta: null });
  store.selectPair("a");
  assert.deepEqual(drawerKeybindingState(get(store)), {
    open: true,
    meta: {
      metadata: { protocol: "websocket" },
      response: { StatusCode: 101, ContentType: "" },
      incomingResponse: null,
    },
  });
});
