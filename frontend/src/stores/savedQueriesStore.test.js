import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import {
  activeSavedQuery,
  BUILTIN_QUERIES,
  canSaveQuery,
  hiddenBuiltinCount,
  createSavedQueriesStore,
  savedQueryGroups,
  visibleSavedQueries,
} from "./createSavedQueriesStore.js";

// An in-memory config file: the app-wide saved queries and hidden built-in
// ids, as the Go side keeps them (sorted by order on save), plus match
// counts by query text. Calls are recorded in `api.calls`.
function fakeApi({ queries = [], hidden = [], counts = {} } = {}) {
  const calls = [];
  const api = {
    calls,
    getAppSavedQueries: async () => ({
      queries: queries.map((q) => ({ ...q })),
      hidden_builtins: [...hidden],
    }),
    saveAppSavedQueries: async (list) => {
      calls.push(["saveAppSavedQueries", list]);
      queries = [...list].sort((a, b) => a.order - b.order);
      return queries.map((q) => ({ ...q }));
    },
    setHiddenBuiltins: async (ids) => {
      calls.push(["setHiddenBuiltins", ids]);
      hidden = [...ids];
      return [...hidden];
    },
    countMatches: async (query) => {
      calls.push(["countMatches", query]);
      const count = counts[query];
      if (typeof count === "function") return count();
      return count ?? { Count: 0, Capped: false, QueryError: null };
    },
  };
  return api;
}

let nextId = 0;
const newId = () => `id-${++nextId}`;

const noise = { id: "n", name: "Third-party noise", query: 'host != "*.acme.test"', order: 0 };
const marked = { id: "m", name: "Highlighted", query: "highlight:*", order: 1 };

async function loadedStore(api) {
  const store = createSavedQueriesStore(api, { newId });
  await store.load();
  return store;
}

const names = (items) => items.map((q) => q.name);

test("the built-ins are the spec's six", () => {
  assert.deepEqual(
    BUILTIN_QUERIES.map((q) => [q.name, q.query]),
    [
      ["Server errors", "status_code >= 500"],
      ["Client errors", "status_code >= 400 AND status_code < 500"],
      ["Redirects", "status_code >= 300 AND status_code < 400"],
      ["Writes", 'method = "POST" OR method = "PUT" OR method = "PATCH" OR method = "DELETE"'],
      ["Cookies set", 'response_head:"set-cookie"'],
      ["JWTs anywhere", '"eyJhbGci"'],
    ],
  );
});

test("load groups the app-wide queries under All projects, then the built-ins", async () => {
  const store = await loadedStore(fakeApi({ queries: [noise, marked] }));
  const groups = savedQueryGroups(get(store));

  assert.deepEqual(
    groups.map((g) => g.label),
    ["All projects", "Built-in"],
  );
  assert.deepEqual(names(groups[0].items), ["Third-party noise", "Highlighted"]);
  assert.equal(groups[1].items.length, 6);
  assert.deepEqual(
    names(visibleSavedQueries(get(store))).slice(0, 3),
    ["Third-party noise", "Highlighted", "Server errors"],
  );
});

test("a hidden built-in leaves the menu until hidden built-ins are shown", async () => {
  const api = fakeApi({ hidden: ["writes"] });
  const store = await loadedStore(api);

  const builtins = savedQueryGroups(get(store)).find((g) => g.key === "builtin");
  assert.ok(!names(builtins.items).includes("Writes"));
  assert.ok(!names(visibleSavedQueries(get(store))).includes("Writes"));
  assert.equal(hiddenBuiltinCount(get(store)), 1);

  const shown = savedQueryGroups(get(store), { showHidden: true }).find((g) => g.key === "builtin");
  const writes = shown.items.find((q) => q.name === "Writes");
  assert.equal(writes.hidden, true);
});

test("hiding and showing a built-in writes the hidden ids", async () => {
  const api = fakeApi();
  const store = await loadedStore(api);

  await store.setBuiltinHidden("redirects", true);
  await store.setBuiltinHidden("writes", true);
  assert.deepEqual(get(store).hiddenBuiltins, ["redirects", "writes"]);

  await store.setBuiltinHidden("redirects", false);
  assert.deepEqual(api.calls.at(-1), ["setHiddenBuiltins", ["writes"]]);
  assert.deepEqual(get(store).hiddenBuiltins, ["writes"]);
});

test("saving a query appends it to All projects with a new id", async () => {
  const api = fakeApi({ queries: [noise] });
  const store = await loadedStore(api);

  const saved = await store.save("  Admin denied ", "status_code = 403");

  assert.equal(saved.name, "Admin denied");
  assert.equal(saved.source, "app");
  const [, written] = api.calls.at(-1);
  assert.deepEqual(
    written.map((q) => [q.name, q.query, q.order]),
    [
      ["Third-party noise", 'host != "*.acme.test"', 0],
      ["Admin denied", "status_code = 403", 1],
    ],
  );
  assert.ok(written[1].id);
  assert.deepEqual(names(savedQueryGroups(get(store))[0].items), ["Third-party noise", "Admin denied"]);
});

test("a query saved without a name is named after its text", async () => {
  const store = await loadedStore(fakeApi());
  const saved = await store.save("  ", 'host = "admin.acme.test" AND status_code = 403 AND method = "GET"');
  assert.equal(saved.name, 'host = "admin.acme.test" AND sta…');
});

test("renaming keeps the query and its place; a blank name keeps the old one", async () => {
  const api = fakeApi({ queries: [noise, marked] });
  const store = await loadedStore(api);
  const entry = savedQueryGroups(get(store))[0].items[0];

  await store.rename(entry, " Noise ");
  assert.deepEqual(names(savedQueryGroups(get(store))[0].items), ["Noise", "Highlighted"]);

  const calls = api.calls.length;
  await store.rename(savedQueryGroups(get(store))[0].items[0], "   ");
  assert.equal(api.calls.length, calls, "nothing to write");
  assert.equal(savedQueryGroups(get(store))[0].items[0].name, "Noise");
});

test("deleting removes only that query", async () => {
  const api = fakeApi({ queries: [noise, marked] });
  const store = await loadedStore(api);

  await store.remove(savedQueryGroups(get(store))[0].items[0]);

  assert.deepEqual(names(savedQueryGroups(get(store))[0].items), ["Highlighted"]);
  assert.deepEqual(names((await api.getAppSavedQueries()).queries), ["Highlighted"]);
});

test("a failed write leaves the menu as it was and rejects", async () => {
  const api = fakeApi({ queries: [noise] });
  api.saveAppSavedQueries = async () => {
    throw new Error("disk full");
  };
  const store = await loadedStore(api);

  await assert.rejects(store.save("New", "note:*"), /disk full/);
  assert.deepEqual(names(savedQueryGroups(get(store))[0].items), ["Third-party noise"]);
});

test("the active saved query is the visible one whose query is the box's text", async () => {
  const store = await loadedStore(fakeApi({ queries: [noise], hidden: ["server-errors"] }));
  const state = get(store);

  assert.equal(activeSavedQuery(state, ' host != "*.acme.test" ')?.name, "Third-party noise");
  assert.equal(activeSavedQuery(state, "status_code >= 400 AND status_code < 500")?.name, "Client errors");
  assert.equal(activeSavedQuery(state, "status_code >= 500"), null, "hidden built-ins aren't active");
  assert.equal(activeSavedQuery(state, ""), null);
});

test("only a valid query that isn't saved yet can be saved", async () => {
  const store = await loadedStore(fakeApi({ queries: [noise] }));
  const state = get(store);

  assert.equal(canSaveQuery(state, "note:*", true), true);
  assert.equal(canSaveQuery(state, "note:*", false), false, "invalid or not run yet");
  assert.equal(canSaveQuery(state, "   ", true), false);
  assert.equal(canSaveQuery(state, 'host != "*.acme.test"', true), false, "already saved");
  assert.equal(canSaveQuery(state, "status_code >= 500", true), false, "a built-in");
});

test("loadCounts fills in each query's count one at a time, keyed by query", async () => {
  const counts = {
    [noise.query]: { Count: 12, Capped: false, QueryError: null },
    "status_code >= 500": { Count: 100000, Capped: true, QueryError: null },
    '"eyJhbGci"': { Count: 0, Capped: false, QueryError: { Message: "term too short", Position: 1 } },
  };
  const api = fakeApi({ queries: [noise], counts });
  const store = await loadedStore(api);

  const loading = store.loadCounts();
  assert.deepEqual(get(store).counts, {}, "nothing before the first count returns");
  await loading;

  const state = get(store);
  assert.deepEqual(state.counts[noise.query], { count: 12, capped: false });
  assert.deepEqual(state.counts["status_code >= 500"], { count: 100000, capped: true });
  assert.deepEqual(state.counts['"eyJhbGci"'], { error: "term too short" });
  assert.equal(
    api.calls.filter(([name]) => name === "countMatches").length,
    7,
    "the app-wide query and the six built-ins",
  );
});

test("a newer loadCounts stops the older one", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const api = fakeApi({
    queries: [noise],
    counts: { [noise.query]: () => gate.then(() => ({ Count: 1, Capped: false, QueryError: null })) },
  });
  const store = await loadedStore(api);

  const first = store.loadCounts();
  await Promise.resolve();
  const callsAfterFirst = api.calls.filter(([name]) => name === "countMatches").length;
  const second = store.loadCounts();
  release();
  await Promise.all([first, second]);

  // The first run counted only its first query before the second took over.
  assert.equal(callsAfterFirst, 1);
  assert.equal(api.calls.filter(([name]) => name === "countMatches").length, 1 + 7);
});

test("a failed count shows no count and the others still load", async () => {
  const api = fakeApi({
    queries: [noise],
    counts: {
      [noise.query]: () => Promise.reject(new Error("no project")),
      "status_code >= 500": { Count: 3, Capped: false, QueryError: null },
    },
  });
  const store = await loadedStore(api);
  await store.loadCounts();

  assert.equal(get(store).counts[noise.query], undefined);
  assert.deepEqual(get(store).counts["status_code >= 500"], { count: 3, capped: false });
});

test("load reads the config once; a failed read leaves the built-ins", async () => {
  const api = fakeApi({ queries: [noise] });
  let reads = 0;
  const read = api.getAppSavedQueries;
  api.getAppSavedQueries = () => (reads++, read());
  const store = createSavedQueriesStore(api, { newId });
  await Promise.all([store.load(), store.load()]);
  assert.equal(reads, 1);

  const broken = fakeApi();
  broken.getAppSavedQueries = async () => {
    throw new Error("unreadable");
  };
  const fallback = createSavedQueriesStore(broken, { newId });
  await fallback.load();
  assert.deepEqual(
    savedQueryGroups(get(fallback)).map((g) => g.key),
    ["builtin"],
    "empty groups are left out",
  );
});

test("hidden ids that no built-in has don't count as hidden built-ins", async () => {
  const store = await loadedStore(fakeApi({ hidden: ["writes", "retired-built-in"] }));
  assert.equal(hiddenBuiltinCount(get(store)), 1);
});
