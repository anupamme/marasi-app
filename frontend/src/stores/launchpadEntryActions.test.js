// Remove from launchpad, from the entry context menu. Moves are covered
// with drag and drop (launchpadMove tests): the menu moves through the same
// store method.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { createLaunchpadStore, pendingEntryIds, pendingLaunchOf } from "./createLaunchpadStore.js";

const entry = (id) => ({ ID: id, Method: "GET", Path: `/${id}` });

// Marasi in memory: lp1 holds a to e, lp2 holds x. Unlinks change the
// lists the way Marasi would.
function fakeApi() {
  const lists = { lp1: ["a", "b", "c", "d", "e"], lp2: ["x"] };
  const api = {
    calls: [],
    pending: [],
    getLaunchpads: async () => [
      { ID: "lp1", Name: "Login", EntryCount: lists.lp1.length },
      { ID: "lp2", Name: "Search", EntryCount: lists.lp2.length },
    ],
    getEntries: async (id) => (lists[id] || []).map(entry),
    getRawDetails: async (id) => ({ Request: { ID: id, Raw: `GET /${id} HTTP/1.1\n\n` }, Response: null }),
    pendingLaunches: async () => api.pending.map((launch) => ({ ...launch })),
    getLaunch: async () => null,
    unlinkEntries: async (launchpadId, ids) => {
      api.calls.push(["unlinkEntries", launchpadId, ids]);
      lists[launchpadId] = lists[launchpadId].filter((id) => !ids.includes(id));
      return ids.length;
    },
  };
  return api;
}

async function populated(api = fakeApi()) {
  const store = createLaunchpadStore(api);
  await store.populate();
  return store;
}

const order = (store, id) => get(store).entriesByLaunchpad[id].map((item) => item.ID);

test("removing unlinks the entries from the launchpad, reloads it with its count, and clears the selection", async () => {
  const api = fakeApi();
  const store = await populated(api);
  store.selectAllEntries("lp1");
  assert.equal(await store.removeEntries("lp1", ["a", "c"]), 2);
  assert.deepEqual(api.calls, [["unlinkEntries", "lp1", ["a", "c"]]]);
  assert.deepEqual(order(store, "lp1"), ["b", "d", "e"]);
  assert.equal(get(store).launchpads[0].EntryCount, 3);
  assert.deepEqual(get(store).entrySelection.ids, []);
});

test("a removal Marasi refuses for a pending launch reads the pending launches and keeps the selection", async () => {
  const api = fakeApi();
  const store = await populated(api);
  store.toggleEntry("lp1", "b");
  // Launched in another window: this store has not heard of it.
  api.pending.push({ ID: "b", LaunchpadID: "lp1", Status: "pending" });
  api.unlinkEntries = async () => {
    throw new Error("unlinking traffic: launch_pending (b)");
  };
  await assert.rejects(store.removeEntries("lp1", ["b"]), /launch_pending/);
  const state = get(store);
  assert.equal(pendingLaunchOf(state, "lp1")?.ID, "b");
  assert.deepEqual(state.entrySelection.ids, ["b"]);
});

// Marasi refuses to move or remove an entry only while its launch is
// pending from that launchpad (marasi ADR-0053); a pair launched from
// another launchpad and linked here too moves freely.
test("an entry is launching from a launchpad only when its pending launch came from there", () => {
  const state = {
    launchesById: {
      a: { ID: "a", LaunchpadID: "lp1", Status: "pending" },
      b: { ID: "b", LaunchpadID: "lp2", Status: "pending" },
      c: { ID: "c", LaunchpadID: "lp1", Status: "completed" },
    },
  };
  assert.deepEqual(pendingEntryIds(state, "lp1", ["a", "b", "c", "d"]), ["a"]);
  assert.deepEqual(pendingEntryIds(state, "lp2", ["a", "b"]), ["b"]);
});
