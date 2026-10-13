import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import {
  compareQuickPick,
  createLaunchpadStore,
  dirtyLaunchpadIds,
  isDraftDirty,
} from "./createLaunchpadStore.js";

// An in-memory backend: launchpads, their entries, and raw details by id.
function fakeApi({ launchpads = [], entries = {}, raws = {} } = {}) {
  const calls = [];
  let nextId = 1;
  const api = {
    calls,
    getLaunchpads: async () => launchpads.map((launchpad) => ({ ...launchpad })),
    getEntries: async (id) => (entries[id] || []).map((entry) => ({ ...entry })),
    getRawDetails: async (id) =>
      id in raws ? { Request: { ID: id, Raw: raws[id] }, Response: null } : null,
    createLaunchpad: async (name, description) => {
      const id = `new-${nextId++}`;
      calls.push(["createLaunchpad", name, description]);
      launchpads.push({ ID: id, Name: name, Description: description });
      return id;
    },
    updateLaunchpad: async (id, name, description) => {
      calls.push(["updateLaunchpad", id, name, description]);
    },
    deleteLaunchpad: async (id) => {
      calls.push(["deleteLaunchpad", id]);
      launchpads = launchpads.filter((launchpad) => launchpad.ID !== id);
    },
    launch: async (raw, id, useHttps) => {
      calls.push(["launch", raw, id, useHttps]);
    },
  };
  return api;
}

const entry = (id) => ({ ID: id, Method: "GET", Path: `/${id}` });

function twoLaunchpads() {
  return fakeApi({
    launchpads: [
      { ID: "lp1", Name: "Login", Description: "auth flow" },
      { ID: "lp2", Name: "Search", Description: "" },
    ],
    entries: { lp1: [entry("a"), entry("b")], lp2: [entry("c")] },
    raws: {
      a: "GET /a HTTP/1.1\r\nHost: x\r\n\r\n",
      b: "GET /b HTTP/1.1\r\nHost: x\r\n\r\n",
      c: "GET /c HTTP/1.1\r\nHost: x\r\n\r\n",
    },
  });
}

test("populate selects the first launchpad and seeds its draft from the latest entry", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  const state = get(store);
  assert.deepEqual(
    state.launchpads.map((launchpad) => launchpad.ID),
    ["lp1", "lp2"],
  );
  assert.equal(state.selectedLaunchpadId, "lp1");
  assert.equal(state.selectedEntryByLaunchpad.lp1, "b");
  assert.deepEqual(state.draftsByLaunchpad.lp1, {
    raw: "GET /b HTTP/1.1\r\nHost: x\r\n\r\n",
    seededFrom: "b",
    useHttps: true,
  });
  assert.equal(isDraftDirty(state, "lp1"), false);
});

test("an edit that only changes line endings leaves the draft clean", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  store.updateDraft("lp1", "GET /b HTTP/1.1\nHost: x\n\n");
  assert.equal(isDraftDirty(get(store), "lp1"), false);
  store.updateDraft("lp1", "GET /b?q=1 HTTP/1.1\nHost: x\n\n");
  assert.equal(isDraftDirty(get(store), "lp1"), true);
});

test("revert restores the draft to the request it was seeded from", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  store.updateDraft("lp1", "edited");
  store.revertDraft("lp1");
  assert.equal(get(store).draftsByLaunchpad.lp1.raw, "GET /b HTTP/1.1\r\nHost: x\r\n\r\n");
  assert.equal(isDraftDirty(get(store), "lp1"), false);
});

test("selecting another entry over a dirty draft asks for confirmation first", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  store.updateDraft("lp1", "edited");

  assert.deepEqual(await store.selectEntry("lp1", "a"), { needsConfirm: true });
  assert.equal(get(store).selectedEntryByLaunchpad.lp1, "b");
  assert.equal(get(store).draftsByLaunchpad.lp1.raw, "edited");

  assert.deepEqual(await store.selectEntry("lp1", "a", { force: true }), {
    needsConfirm: false,
  });
  assert.equal(get(store).selectedEntryByLaunchpad.lp1, "a");
  assert.equal(get(store).draftsByLaunchpad.lp1.raw, "GET /a HTTP/1.1\r\nHost: x\r\n\r\n");
});

test("selecting an entry over a clean draft reseeds it without asking", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  assert.deepEqual(await store.selectEntry("lp1", "a"), { needsConfirm: false });
  assert.equal(get(store).draftsByLaunchpad.lp1.seededFrom, "a");
});

test("a draft survives switching launchpads and keeps its HTTPS choice", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  store.updateDraft("lp1", "edited");
  store.setUseHttps("lp1", false);
  await store.selectLaunchpad("lp2");
  assert.equal(get(store).draftsByLaunchpad.lp2.seededFrom, "c");
  await store.selectLaunchpad("lp1");
  assert.deepEqual(get(store).draftsByLaunchpad.lp1, {
    raw: "edited",
    seededFrom: "b",
    useHttps: false,
  });
});

test("an empty launchpad starts from a blank request", async () => {
  const store = createLaunchpadStore(
    fakeApi({ launchpads: [{ ID: "lp1", Name: "Empty", Description: "" }] }),
  );
  await store.populate();
  const state = get(store);
  assert.deepEqual(state.draftsByLaunchpad.lp1, {
    raw: "GET / HTTP/1.1\nHost: \n\n",
    seededFrom: null,
    useHttps: true,
  });
  assert.equal(isDraftDirty(state, "lp1"), false);
});

test("populating again keeps drafts and the selection, and drops deleted launchpads", async () => {
  const api = twoLaunchpads();
  const store = createLaunchpadStore(api);
  await store.populate();
  await store.selectLaunchpad("lp2");
  store.updateDraft("lp2", "edited");
  await api.deleteLaunchpad("lp1");
  await store.populate();
  const state = get(store);
  assert.equal(state.selectedLaunchpadId, "lp2");
  assert.equal(state.draftsByLaunchpad.lp2.raw, "edited");
  assert.equal(state.draftsByLaunchpad.lp1, undefined);
  assert.equal(state.entriesByLaunchpad.lp1, undefined);
});

test("a populate that resolves after clear does not leak into the new project", async () => {
  const api = twoLaunchpads();
  let release;
  const getLaunchpads = api.getLaunchpads;
  api.getLaunchpads = () =>
    new Promise((resolve) => (release = () => resolve(getLaunchpads())));
  const store = createLaunchpadStore(api);
  const pending = store.populate();
  store.clear();
  release();
  await pending;
  assert.deepEqual(get(store).launchpads, []);
  assert.equal(get(store).selectedLaunchpadId, null);
});

const launched = (id, launchpadId, raw) => ({
  ID: id,
  Scheme: "https",
  Method: "GET",
  Host: "x",
  Path: `/${id}`,
  Raw: raw,
  Metadata: { launchpad_id: launchpadId },
  RequestedAt: "2026-10-13T10:00:00Z",
});

test("launch sends the draft and the arriving entry is selected with a clean draft", async () => {
  const api = twoLaunchpads();
  const store = createLaunchpadStore(api);
  await store.populate();
  store.updateDraft("lp1", "GET /b?q=1 HTTP/1.1\nHost: x\n\n");
  store.setUseHttps("lp1", false);
  await store.launch("lp1");
  assert.deepEqual(api.calls.at(-1), [
    "launch",
    "GET /b?q=1 HTTP/1.1\nHost: x\n\n",
    "lp1",
    false,
  ]);

  // Marasi echoes the request as sent, with its own line endings.
  store.onRequest(launched("d", "lp1", "GET /b?q=1 HTTP/1.1\r\nHost: x\r\n\r\n"));
  const state = get(store);
  assert.deepEqual(
    state.entriesByLaunchpad.lp1.map((item) => item.ID),
    ["a", "b", "d"],
  );
  assert.equal(state.selectedEntryByLaunchpad.lp1, "d");
  assert.equal(state.draftsByLaunchpad.lp1.seededFrom, "d");
  assert.equal(state.draftsByLaunchpad.lp1.useHttps, false);
  assert.equal(isDraftDirty(state, "lp1"), false);
  assert.deepEqual(state.pendingLaunchByLaunchpad, {});
});

test("edits typed after Launch survive the arrival as a dirty draft", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  store.updateDraft("lp1", "first");
  await store.launch("lp1");
  store.updateDraft("lp1", "second");
  store.onRequest(launched("d", "lp1", "first"));
  const state = get(store);
  assert.equal(state.selectedEntryByLaunchpad.lp1, "d");
  assert.equal(state.draftsByLaunchpad.lp1.raw, "second");
  assert.equal(isDraftDirty(state, "lp1"), true);
});

test("an arrival for a launchpad that is not open counts as unseen until it is opened", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  await store.selectLaunchpad("lp2");
  await store.launch("lp2");
  await store.selectLaunchpad("lp1");
  store.onRequest(launched("d", "lp2", "GET /c HTTP/1.1\r\nHost: x\r\n\r\n"));
  store.onRequest(launched("e", "lp2", "GET /c HTTP/1.1\r\nHost: x\r\n\r\n"));
  assert.equal(get(store).unseenByLaunchpad.lp2, 2);
  assert.equal(get(store).selectedLaunchpadId, "lp1");
  await store.selectLaunchpad("lp2");
  assert.equal(get(store).unseenByLaunchpad.lp2, 0);
  assert.equal(get(store).selectedEntryByLaunchpad.lp2, "d");
});

test("traffic without a known launchpad id is ignored", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  const before = get(store);
  store.onRequest({ ...launched("p", "lp1", "x"), Metadata: {} });
  store.onRequest(launched("q", "elsewhere", "x"));
  store.onResponse({ ID: "p", StatusCode: 200 });
  assert.equal(get(store), before);
});

test("the response fills in the arrived entry's status and length", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  await store.launch("lp1");
  store.onRequest(launched("d", "lp1", "GET /b HTTP/1.1\r\nHost: x\r\n\r\n"));
  store.onResponse({
    ID: "d",
    Status: "201 Created",
    StatusCode: 201,
    ContentType: "text/plain",
    Length: "12",
    Raw: "HTTP/1.1 201 Created\r\n\r\n",
    RespondedAt: "2026-10-13T10:00:01Z",
  });
  const state = get(store);
  const arrived = state.entriesByLaunchpad.lp1.at(-1);
  assert.equal(arrived.StatusCode, 201);
  assert.equal(arrived.Length, "12");
  assert.equal(state.detailsById.d.Response.Raw, "HTTP/1.1 201 Created\r\n\r\n");
});

test("a failed launch is not left pending", async () => {
  const api = twoLaunchpads();
  api.launch = async () => {
    throw new Error("listener offline");
  };
  const store = createLaunchpadStore(api);
  await store.populate();
  await assert.rejects(store.launch("lp1"), /listener offline/);
  assert.deepEqual(get(store).pendingLaunchByLaunchpad, {});
});

function threeEntries() {
  return fakeApi({
    launchpads: [
      { ID: "lp1", Name: "Login", Description: "" },
      { ID: "lp2", Name: "Search", Description: "" },
    ],
    entries: { lp1: [entry("a"), entry("b"), entry("c")], lp2: [entry("z")] },
    raws: { a: "A", b: "B", c: "C", z: "Z" },
  });
}

test("compare starts from the current entry as A and the next pick sets B", async () => {
  const store = createLaunchpadStore(threeEntries());
  await store.populate();
  await store.startCompare("c");
  assert.deepEqual(get(store).compare, {
    launchpadId: "lp1",
    leftId: "c",
    rightId: null,
    picking: "right",
  });
  await store.setCompareSide("right", "a");
  const state = get(store);
  assert.deepEqual(state.compare, {
    launchpadId: "lp1",
    leftId: "c",
    rightId: "a",
    picking: null,
  });
  assert.equal(state.detailsById.a.Request.Raw, "A");
  assert.equal(state.detailsById.c.Request.Raw, "C");
});

test("a compare chip re-picks its side and swap exchanges A and B", async () => {
  const store = createLaunchpadStore(threeEntries());
  await store.populate();
  await store.startCompare("c");
  await store.setCompareSide("right", "a");
  store.pickCompareSide("left");
  assert.equal(get(store).compare.picking, "left");
  await store.setCompareSide("left", "b");
  assert.deepEqual(
    [get(store).compare.leftId, get(store).compare.rightId],
    ["b", "a"],
  );
  store.swapCompare();
  assert.deepEqual(
    [get(store).compare.leftId, get(store).compare.rightId],
    ["a", "b"],
  );
});

test("quick picks name the previous, next and original entry relative to A", async () => {
  const store = createLaunchpadStore(threeEntries());
  await store.populate();
  await store.startCompare("b");
  const state = get(store);
  assert.equal(compareQuickPick(state, "previous"), "a");
  assert.equal(compareQuickPick(state, "next"), "c");
  assert.equal(compareQuickPick(state, "original"), "a");
  await store.startCompare("a");
  assert.equal(compareQuickPick(get(store), "previous"), null);
});

test("closing compare or switching launchpads ends the comparison", async () => {
  const store = createLaunchpadStore(threeEntries());
  await store.populate();
  await store.startCompare("c");
  store.closeCompare();
  assert.equal(get(store).compare, null);
  await store.startCompare("c");
  await store.selectLaunchpad("lp2");
  assert.equal(get(store).compare, null);
});

test("a created launchpad opens empty with a blank draft", async () => {
  const api = twoLaunchpads();
  const store = createLaunchpadStore(api);
  await store.populate();
  const id = await store.createLaunchpad({ name: "Scratch", description: "notes" });
  assert.deepEqual(api.calls.at(-1), ["createLaunchpad", "Scratch", "notes"]);
  const state = get(store);
  assert.equal(state.selectedLaunchpadId, id);
  assert.deepEqual(state.launchpads.at(-1), {
    ID: id,
    Name: "Scratch",
    Description: "notes",
  });
  assert.deepEqual(state.entriesByLaunchpad[id], []);
  assert.equal(state.draftsByLaunchpad[id].seededFrom, null);
});

test("renaming a launchpad saves its name and description", async () => {
  const api = twoLaunchpads();
  const store = createLaunchpadStore(api);
  await store.populate();
  await store.updateLaunchpad("lp2", { name: "Search v2", description: "q param" });
  assert.deepEqual(api.calls.at(-1), ["updateLaunchpad", "lp2", "Search v2", "q param"]);
  assert.deepEqual(get(store).launchpads[1], {
    ID: "lp2",
    Name: "Search v2",
    Description: "q param",
  });
});

test("deleting the open launchpad drops its draft and opens its neighbour", async () => {
  const api = twoLaunchpads();
  const store = createLaunchpadStore(api);
  await store.populate();
  store.updateDraft("lp1", "edited");
  await store.deleteLaunchpad("lp1");
  assert.deepEqual(api.calls.at(-1), ["deleteLaunchpad", "lp1"]);
  const state = get(store);
  assert.deepEqual(state.launchpads.map((launchpad) => launchpad.ID), ["lp2"]);
  assert.equal(state.draftsByLaunchpad.lp1, undefined);
  assert.equal(state.selectedLaunchpadId, "lp2");
  assert.equal(state.selectedEntryByLaunchpad.lp2, "c");
});

test("dirty launchpads are listed for the close and quit prompts", async () => {
  const store = createLaunchpadStore(twoLaunchpads());
  await store.populate();
  await store.selectLaunchpad("lp2");
  assert.deepEqual(dirtyLaunchpadIds(get(store)), []);
  store.updateDraft("lp2", "edited");
  assert.deepEqual(dirtyLaunchpadIds(get(store)), ["lp2"]);
});
