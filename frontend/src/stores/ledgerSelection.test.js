// The Ledger's multi-row selection: click, ⌘-click, ⇧-click, ⌘⇧-click,
// drag sweeps, ⇧↑/↓, select all and right-click, and the actions the context
// menu runs on the selected pairs, one call per pair.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { createLedgerStore, focusedPair, selectedPairs } from "./createLedgerStore.js";

function fakeApi({ liveView = [], exclusion = [], results = {}, fail = new Set() } = {}) {
  const calls = [];
  const record = (name) => async (...args) => {
    calls.push([name, ...args]);
    if (args.some((arg) => fail.has(arg))) throw new Error(`${name} failed`);
    return `${name}-result`;
  };
  let launchpads = 0;
  return {
    calls,
    getLiveView: async () => liveView.map((pair) => ({ ...pair })),
    getExclusion: async () => [...exclusion],
    setExclusion: async (types) => {
      calls.push(["setExclusion", types]);
      exclusion = [...types];
    },
    queryTraffic: async (query) =>
      results[query] ?? { Items: [], NextCursor: null, IndexComplete: true },
    createLaunchpad: async (name, description) => {
      calls.push(["createLaunchpad", name, description]);
      launchpads += 1;
      return `lp${launchpads}`;
    },
    linkToLaunchpad: record("linkToLaunchpad"),
    linkToFinding: record("linkToFinding"),
    unlinkFromFinding: record("unlinkFromFinding"),
    linkToTestCase: record("linkToTestCase"),
    unlinkFromTestCase: record("unlinkFromTestCase"),
    sendToArmory: record("sendToArmory"),
  };
}

const pair = (id, extra = {}) => ({ ID: id, Method: "GET", Path: `/${id}`, ...extra });

// The live view a…e; the table reads it newest first: e, d, c, b, a.
async function storeWith(liveView = ["a", "b", "c", "d", "e"].map((id) => pair(id)), options = {}) {
  const api = fakeApi({ liveView, ...options });
  const store = createLedgerStore(api);
  await store.populate();
  return { store, api };
}

const selected = (store) => [...get(store).selection.ids].sort();
const plain = {};
const toggle = { toggle: true };
const range = { range: true };

test("a click selects only that row and focuses it", async () => {
  const { store } = await storeWith();
  store.clickRow("d", plain);
  store.clickRow("b", plain);
  assert.deepEqual(selected(store), ["b"]);
  assert.equal(get(store).selection.focus, "b");
  assert.equal(focusedPair(get(store)).ID, "b");
});

test("⌘-click toggles a row and moves the anchor there", async () => {
  const { store } = await storeWith();
  store.clickRow("d", plain);
  store.clickRow("b", toggle);
  assert.deepEqual(selected(store), ["b", "d"]);
  assert.equal(get(store).selection.focus, "b");
  assert.equal(get(store).selection.anchor, "b");

  store.clickRow("b", toggle);
  assert.deepEqual(selected(store), ["d"]);
  assert.equal(get(store).selection.focus, "d", "the focus stays on a selected row");

  store.clickRow("d", toggle);
  assert.deepEqual(selected(store), []);
  assert.equal(get(store).selection.focus, null, "the drawer closes with nothing selected");
});

test("⇧-click selects the range from the anchor, replacing the selection", async () => {
  const { store } = await storeWith();
  // The table reads e, d, c, b, a.
  store.clickRow("a", plain);
  store.clickRow("e", toggle);
  store.clickRow("c", range);
  assert.deepEqual(selected(store), ["c", "d", "e"], "from the anchor e down to c");
  assert.equal(get(store).selection.focus, "c");

  store.clickRow("a", range);
  assert.deepEqual(selected(store), ["a", "b", "c", "d", "e"], "the anchor stays at e");
  store.clickRow("d", range);
  assert.deepEqual(selected(store), ["d", "e"]);
});

test("⌘⇧-click adds the range from the anchor to the selection", async () => {
  const { store } = await storeWith();
  store.clickRow("a", plain);
  store.clickRow("d", toggle);
  store.clickRow("e", { toggle: true, range: true });
  assert.deepEqual(selected(store), ["a", "d", "e"]);
});

test("⇧-click with no anchor selects just that row", async () => {
  const { store } = await storeWith();
  store.clickRow("c", range);
  assert.deepEqual(selected(store), ["c"]);
});

test("selected pairs come in table order", async () => {
  const { store } = await storeWith();
  store.clickRow("a", plain);
  store.clickRow("d", toggle);
  store.clickRow("b", toggle);
  assert.deepEqual(selectedPairs(get(store)).map((p) => p.ID), ["d", "b", "a"]);
});

test("dragging across rows sweeps the range from the pressed row", async () => {
  const { store } = await storeWith();
  store.startSweep("d");
  assert.deepEqual(selected(store), ["d"], "pressing selects the row");
  store.sweepTo("b");
  assert.deepEqual(selected(store), ["b", "c", "d"]);
  store.sweepTo("c");
  assert.deepEqual(selected(store), ["c", "d"], "sweeping back shrinks the range");
  assert.equal(get(store).selection.focus, "c");
  store.endSweep();
  store.sweepTo("a");
  assert.deepEqual(selected(store), ["c", "d"], "moving after the release changes nothing");

  store.clickRow("a", range);
  assert.deepEqual(selected(store), ["a", "b", "c", "d"], "the pressed row is the anchor");
});

test("⇧↑/↓ extend the selection from the anchor; plain ↑/↓ select one row", async () => {
  const { store } = await storeWith();
  store.clickRow("c", plain);
  store.stepSelection(1, { extend: true });
  store.stepSelection(1, { extend: true });
  assert.deepEqual(selected(store), ["a", "b", "c"]);
  assert.equal(get(store).selection.focus, "a");
  store.stepSelection(-1, { extend: true });
  assert.deepEqual(selected(store), ["b", "c"], "moving back toward the anchor shrinks it");
  store.stepSelection(-1);
  assert.deepEqual(selected(store), ["c"]);
});

test("⌘A selects every row the table lists", async () => {
  const { store } = await storeWith(
    [pair("a"), pair("b", { ContentType: "image/png" }), pair("c")],
    { exclusion: ["image/png"] },
  );
  store.selectAll();
  assert.deepEqual(selected(store), ["a", "c"]);
  assert.equal(get(store).selection.focus, "c", "the focus is the top row");
});

test("right-clicking a selected row keeps the selection; another row replaces it", async () => {
  const { store } = await storeWith();
  store.clickRow("a", plain);
  store.clickRow("c", range);
  store.contextRow("b");
  assert.deepEqual(selected(store), ["a", "b", "c"]);
  store.contextRow("e");
  assert.deepEqual(selected(store), ["e"]);
});

test("focusing a selected pair shows it in the drawer and keeps the selection", async () => {
  const { store } = await storeWith();
  store.clickRow("a", plain);
  store.clickRow("c", range);
  store.focusPair("b");
  assert.deepEqual(selected(store), ["a", "b", "c"]);
  assert.equal(focusedPair(get(store)).ID, "b");
  store.focusPair("e");
  assert.deepEqual(selected(store), ["e"], "an unselected pair is selected alone");
});

test("selectIDs selects the listed rows that the table shows", async () => {
  const { store } = await storeWith();
  store.selectIDs(["b", "zzz", "d"]);
  assert.deepEqual(selected(store), ["b", "d"]);
  assert.equal(get(store).selection.focus, "d", "the focus is the topmost");
});

test("a new launchpad takes every pair; one pair names it after its request number", async () => {
  const { store, api } = await storeWith();
  const one = await store.sendToNewLaunchpad(["b"]);
  assert.deepEqual(one, { launchpadId: "lp1", done: 1, failed: 0 });
  const many = await store.sendToNewLaunchpad(["b", "d"]);
  assert.deepEqual(many, { launchpadId: "lp2", done: 2, failed: 0 });
  assert.deepEqual(api.calls, [
    ["createLaunchpad", "Request 2", "Launchpad for Request 2"],
    ["linkToLaunchpad", "b", "lp1"],
    ["createLaunchpad", "2 requests", "Launchpad for Requests 2, 4"],
    ["linkToLaunchpad", "b", "lp2"],
    ["linkToLaunchpad", "d", "lp2"],
  ]);
});

test("one launchpad each, up to 25 pairs", async () => {
  const { store, api } = await storeWith();
  const result = await store.sendToLaunchpadsEach(["a", "c"]);
  assert.deepEqual(result, { launchpadIds: ["lp1", "lp2"], done: 2, failed: 0 });
  assert.deepEqual(api.calls, [
    ["createLaunchpad", "Request 1", "Launchpad for Request 1"],
    ["linkToLaunchpad", "a", "lp1"],
    ["createLaunchpad", "Request 3", "Launchpad for Request 3"],
    ["linkToLaunchpad", "c", "lp2"],
  ]);
  const tooMany = Array.from({ length: 26 }, (_, i) => `p${i}`);
  await assert.rejects(store.sendToLaunchpadsEach(tooMany), /25/);
});

test("adding to a launchpad, linking and unlinking make one call per pair and count failures", async () => {
  const { store, api } = await storeWith(undefined, { fail: new Set(["c"]) });
  assert.deepEqual(await store.addToLaunchpad(["a", "c"], "L"), { done: 1, failed: 1 });
  assert.deepEqual(await store.linkToFinding(["a", "b"], "F"), { done: 2, failed: 0 });
  assert.deepEqual(await store.unlinkFromFinding(["a"], "F"), { done: 1, failed: 0 });
  assert.deepEqual(await store.linkToTestCase(["b"], "T"), { done: 1, failed: 0 });
  assert.deepEqual(await store.unlinkFromTestCase(["b", "c"], "T"), { done: 1, failed: 1 });
  assert.deepEqual(api.calls, [
    ["linkToLaunchpad", "a", "L"],
    ["linkToLaunchpad", "c", "L"],
    ["linkToFinding", "a", "F"],
    ["linkToFinding", "b", "F"],
    ["unlinkFromFinding", "a", "F"],
    ["linkToTestCase", "b", "T"],
    ["unlinkFromTestCase", "b", "T"],
    ["unlinkFromTestCase", "c", "T"],
  ]);
});

test("sending to Armory makes one template per pair", async () => {
  const { store, api } = await storeWith();
  const result = await store.sendToArmory(["a", "b"]);
  assert.deepEqual(result, {
    done: 2,
    failed: 0,
    results: ["sendToArmory-result", "sendToArmory-result"],
  });
  assert.deepEqual(api.calls, [
    ["sendToArmory", "a"],
    ["sendToArmory", "b"],
  ]);
});

test("pairs that leave the table leave the selection; the focus moves to one that stays", async () => {
  const { store } = await storeWith(
    [pair("a"), pair("b", { ContentType: "text/css" }), pair("c")],
  );
  store.clickRow("a", plain);
  store.clickRow("b", toggle);
  assert.equal(get(store).selection.focus, "b");
  await store.saveExclusion(["text/css"]);
  assert.deepEqual(selected(store), ["a"]);
  assert.equal(get(store).selection.focus, "a");
});
