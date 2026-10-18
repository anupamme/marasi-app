// The launchpad tree's Entry selection: click, ⌘-click, ⇧-click, ⌘A and
// Esc, and when the selection is cleared.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { createLaunchpadStore, isEntrySelected, selectedEntryIds } from "./createLaunchpadStore.js";

const entry = (id) => ({ ID: id, Method: "GET", Path: `/${id}` });

// Two launchpads: lp1 holds a to e, lp2 holds x. Every entry has a request.
function fakeApi() {
  let launchpads = [
    { ID: "lp1", Name: "Login", Description: "" },
    { ID: "lp2", Name: "Search", Description: "" },
  ];
  const entries = { lp1: ["a", "b", "c", "d", "e"].map(entry), lp2: [entry("x")] };
  return {
    getLaunchpads: async () => launchpads.map((launchpad) => ({ ...launchpad })),
    getEntries: async (id) => (entries[id] || []).map((item) => ({ ...item })),
    getRawDetails: async (id) => ({ Request: { ID: id, Raw: `GET /${id} HTTP/1.1\n\n` }, Response: null }),
    deleteLaunchpad: async (id) => {
      launchpads = launchpads.filter((launchpad) => launchpad.ID !== id);
    },
    pendingLaunches: async () => [],
  };
}

async function populated() {
  const store = createLaunchpadStore(fakeApi());
  await store.populate();
  return store;
}

const selection = (store) => get(store).entrySelection;

test("a click selects only that entry and seeds the draft from it", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "b");
  assert.deepEqual(selection(store), { launchpadId: "lp1", ids: ["b"], anchor: "b" });
  assert.equal(get(store).draftsByLaunchpad.lp1.seededFrom, "b");
});

test("a click over a dirty draft asks first and leaves the selection as it was", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "b");
  store.updateDraft("lp1", "edited");
  assert.deepEqual(await store.selectEntry("lp1", "c"), { needsConfirm: true });
  assert.deepEqual(selection(store).ids, ["b"]);
});

test("⌘-click adds or removes an entry and moves the anchor, without reseeding", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "b");
  store.toggleEntry("lp1", "d");
  assert.deepEqual(selection(store), { launchpadId: "lp1", ids: ["b", "d"], anchor: "d" });
  store.toggleEntry("lp1", "b");
  assert.deepEqual(selection(store), { launchpadId: "lp1", ids: ["d"], anchor: "b" });
  assert.equal(get(store).draftsByLaunchpad.lp1.seededFrom, "b");
});

test("⇧-click selects the entries from the anchor to it in entry order, without reseeding", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "b");
  store.extendEntrySelection("lp1", "d");
  assert.deepEqual(selection(store), { launchpadId: "lp1", ids: ["b", "c", "d"], anchor: "b" });
  store.extendEntrySelection("lp1", "a");
  assert.deepEqual(selection(store), { launchpadId: "lp1", ids: ["a", "b"], anchor: "b" });
  assert.equal(get(store).draftsByLaunchpad.lp1.seededFrom, "b");
});

test("grouped or searching, a range covers only the rows the tree shows", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "a");
  store.extendEntrySelection("lp1", "e", ["e", "a", "c"]);
  assert.deepEqual(selection(store).ids, ["e", "a"]);
  store.extendEntrySelection("lp1", "c", ["e", "a", "c"]);
  assert.deepEqual(selection(store).ids, ["a", "c"]);
});

test("⇧-click in another launchpad starts a selection there", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "b");
  store.extendEntrySelection("lp2", "x");
  assert.deepEqual(selection(store), { launchpadId: "lp2", ids: ["x"], anchor: "x" });
});

test("⌘A selects every entry of the launchpad in entry order, and Esc collapses to the anchor", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "c");
  store.selectAllEntries("lp1");
  assert.deepEqual(selection(store), { launchpadId: "lp1", ids: ["a", "b", "c", "d", "e"], anchor: "c" });
  store.collapseEntrySelection();
  assert.deepEqual(selection(store), { launchpadId: "lp1", ids: ["c"], anchor: "c" });
  assert.equal(get(store).draftsByLaunchpad.lp1.seededFrom, "c");
});

test("⌘A in another launchpad replaces the selection, anchored on its first entry", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "c");
  await store.loadEntries("lp2");
  store.selectAllEntries("lp2");
  assert.deepEqual(selection(store), { launchpadId: "lp2", ids: ["x"], anchor: "x" });
});

test("the selected entries read back in entry order, whatever order they were picked in", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "d");
  store.toggleEntry("lp1", "b");
  store.toggleEntry("lp1", "e");
  store.toggleEntry("lp1", "a");
  assert.deepEqual(selectedEntryIds(get(store)), ["a", "b", "d", "e"]);
  assert.equal(isEntrySelected(get(store), "lp1", "b"), true);
  assert.equal(isEntrySelected(get(store), "lp1", "c"), false);
  assert.equal(isEntrySelected(get(store), "lp2", "b"), false);
});

test("deleting the selection's launchpad clears it; deleting another keeps it", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "b");
  store.toggleEntry("lp1", "c");
  await store.deleteLaunchpad("lp2");
  assert.deepEqual(selection(store).ids, ["b", "c"]);
  await store.deleteLaunchpad("lp1");
  assert.deepEqual(selection(store), { launchpadId: null, ids: [], anchor: null });
});

test("closing the project clears the selection", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "b");
  store.clear();
  assert.deepEqual(selection(store), { launchpadId: null, ids: [], anchor: null });
});

test("Esc collapses to the last selected entry when the anchor was just unselected", async () => {
  const store = await populated();
  await store.selectEntry("lp1", "a");
  store.toggleEntry("lp1", "c");
  store.toggleEntry("lp1", "d");
  store.toggleEntry("lp1", "d");
  store.collapseEntrySelection();
  assert.deepEqual(selection(store), { launchpadId: "lp1", ids: ["c"], anchor: "c" });
});
