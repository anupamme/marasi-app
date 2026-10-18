// Moving launchpad entries through the store: the Marasi call, the refresh
// of both launchpads, where the Entry selection goes, and Marasi's refusals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { createLaunchpadStore } from "./createLaunchpadStore.js";

const entry = (id) => ({ ID: id, Method: "GET", Path: `/${id}`, StatusCode: 200 });

// lp1 holds a to e, lp2 holds x. moveEntries moves like Marasi, or throws
// `refuse` when set. `calls` records every move.
function fakeMarasi() {
  const lists = { lp1: ["a", "b", "c", "d", "e"], lp2: ["x"] };
  const fake = {
    calls: [],
    refuse: null,
    lists,
    api: {
      getLaunchpads: async () => [
        { ID: "lp1", Name: "Login", Description: "", EntryCount: lists.lp1.length },
        { ID: "lp2", Name: "Search", Description: "", EntryCount: lists.lp2.length },
      ],
      getEntries: async (id) => (lists[id] || []).map(entry),
      getRawDetails: async (id) => ({ Request: { ID: id, Raw: `GET /${id} HTTP/1.1\n\n` }, Response: null }),
      pendingLaunches: async () => [],
      moveEntries: async (sourceId, targetId, ids, before) => {
        fake.calls.push([sourceId, targetId, ids, before]);
        if (fake.refuse) throw fake.refuse;
        lists[sourceId] = lists[sourceId].filter((id) => !ids.includes(id));
        const rest = lists[targetId];
        const at = before ? rest.indexOf(before) : rest.length;
        lists[targetId] = [...rest.slice(0, at), ...ids, ...rest.slice(at)];
        return ids;
      },
    },
  };
  return fake;
}

async function populated(fake = fakeMarasi()) {
  const store = createLaunchpadStore(fake.api);
  await store.populate();
  await store.loadEntries("lp2");
  return { store, fake };
}

const idsOf = (store, launchpadId) => get(store).entriesByLaunchpad[launchpadId].map((item) => item.ID);
const countOf = (store, launchpadId) =>
  get(store).launchpads.find((launchpad) => launchpad.ID === launchpadId).EntryCount;

test("a move to another launchpad asks Marasi, then refreshes both launchpads and their counts", async () => {
  const { store, fake } = await populated();
  const result = await store.moveEntries({ sourceId: "lp1", targetId: "lp2", ids: ["b", "d"], before: "x" });
  assert.deepEqual(fake.calls, [["lp1", "lp2", ["b", "d"], "x"]]);
  assert.deepEqual(result, { moved: ["b", "d"], refused: null });
  assert.deepEqual(idsOf(store, "lp1"), ["a", "c", "e"]);
  assert.deepEqual(idsOf(store, "lp2"), ["b", "d", "x"]);
  assert.equal(countOf(store, "lp1"), 3);
  assert.equal(countOf(store, "lp2"), 3);
});

test("no `before` sends an empty one, which is the end", async () => {
  const { store, fake } = await populated();
  await store.moveEntries({ sourceId: "lp1", targetId: "lp1", ids: ["a"] });
  assert.deepEqual(fake.calls, [["lp1", "lp1", ["a"], ""]]);
  assert.deepEqual(idsOf(store, "lp1"), ["b", "c", "d", "e", "a"]);
});

test("the Entry selection follows the moved entries into the target", async () => {
  const { store } = await populated();
  await store.selectEntry("lp1", "b");
  store.toggleEntry("lp1", "d");
  await store.moveEntries({ sourceId: "lp1", targetId: "lp2", ids: ["b", "d"] });
  assert.deepEqual(get(store).entrySelection, { launchpadId: "lp2", ids: ["b", "d"], anchor: "d" });
});

test("a drop that leaves the order as it is does not call Marasi", async () => {
  const { store, fake } = await populated();
  // b and c dropped before d, where they already are.
  const result = await store.moveEntries({ sourceId: "lp1", targetId: "lp1", ids: ["b", "c"], before: "d" });
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(result, { moved: ["b", "c"], refused: null });
});

test("a pending launch Marasi refuses to move says how many, and refreshes both launchpads", async () => {
  const { store, fake } = await populated();
  fake.lists.lp2.push("late");
  fake.refuse = new Error("moving launchpad entries: launch_pending (b, d): a launch is pending");
  const result = await store.moveEntries({ sourceId: "lp1", targetId: "lp2", ids: ["b", "d"] });
  assert.deepEqual(result, { moved: null, refused: "2 pairs are still launching; nothing was moved" });
  assert.deepEqual(idsOf(store, "lp2"), ["x", "late"]);
});

test("Marasi's stale-view refusals say why and refresh both launchpads", async () => {
  for (const [code, why] of [
    ["already_linked", "A pair is already in Search; nothing was moved"],
    ["not_linked", "A pair is no longer in Login; nothing was moved"],
    ["invalid_placement", "The launchpad changed; nothing was moved"],
  ]) {
    const { store, fake } = await populated();
    fake.lists.lp1.pop();
    fake.refuse = new Error(`moving launchpad entries: ${code}: refused`);
    const result = await store.moveEntries({ sourceId: "lp1", targetId: "lp2", ids: ["b"] });
    assert.deepEqual(result, { moved: null, refused: why });
    assert.deepEqual(idsOf(store, "lp1"), ["a", "b", "c", "d"]);
  }
});

test("any other failure is thrown", async () => {
  const { store, fake } = await populated();
  fake.refuse = new Error("database is locked");
  await assert.rejects(store.moveEntries({ sourceId: "lp1", targetId: "lp2", ids: ["b"] }), /database is locked/);
});

test("dragging an unselected entry makes it the Entry selection without reseeding the draft", async () => {
  const { store } = await populated();
  await store.selectEntry("lp1", "b");
  store.selectOnlyEntry("lp1", "d");
  assert.deepEqual(get(store).entrySelection, { launchpadId: "lp1", ids: ["d"], anchor: "d" });
  assert.equal(get(store).draftsByLaunchpad.lp1.seededFrom, "b");
});
