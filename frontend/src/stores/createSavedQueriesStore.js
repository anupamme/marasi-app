// Saved queries: the open project's own (client settings
// `ledger.saved_query.<uuid>`, each { name, query, order }, ADR 0004), the
// app-wide ones (the app config YAML), and the built-ins that ship with the
// app, which can be hidden. Backend calls go through the injected `api`, so
// tests run against a fake:
//
//   getAppSavedQueries()        -> { queries: [{ id, name, query, order }], hidden_builtins: [id] }
//   saveAppSavedQueries(list)   -> the saved list, in order
//   setHiddenBuiltins(ids)      -> the saved ids
//   countMatches(query)         -> { Count, Capped, QueryError } (CountTraffic)
//   listClientSettings(prefix)  -> [{ key, value }] (the project's settings)
//   setClientSetting(key, value), deleteClientSetting(key)
//
// Each writable source is an adapter in `sources` with add, update and
// remove; its entries live in state.queries[source].
import { writable } from "svelte/store";

/** The client-setting key prefix of the project's saved queries. */
export const PROJECT_QUERY_PREFIX = "ledger.saved_query.";

/** The menu's groups, in order. Only "builtin" is read-only. */
export const SOURCES = [
  { key: "project", label: "This project" },
  { key: "app", label: "All projects" },
  { key: "builtin", label: "Built-in" },
];

/** The saved queries that ship with the app. Their ids are stable: hiding one stores its id. */
export const BUILTIN_QUERIES = [
  { id: "server-errors", name: "Server errors", query: "status_code >= 500" },
  { id: "client-errors", name: "Client errors", query: "status_code >= 400 AND status_code < 500" },
  { id: "redirects", name: "Redirects", query: "status_code >= 300 AND status_code < 400" },
  {
    id: "writes",
    name: "Writes",
    query: 'method = "POST" OR method = "PUT" OR method = "PATCH" OR method = "DELETE"',
  },
  { id: "cookies-set", name: "Cookies set", query: 'response_head:"set-cookie"' },
  { id: "jwts-anywhere", name: "JWTs anywhere", query: '"eyJhbGci"' },
].map((q, order) => ({ ...q, order, source: "builtin" }));

// How much of a query names a query saved without a name.
const UNNAMED_LENGTH = 32;

function initialState() {
  return {
    // Each writable source's entries ({ id, name, query, order, source }), in order.
    queries: { project: [], app: [] },
    // Ids of the hidden built-ins.
    hiddenBuiltins: [],
    // Match counts by query text: { count, capped }, or { error } for a
    // query Marasi rejects. A query without an entry is still counting.
    counts: {},
  };
}

/**
 * The menu's groups ({ key, label, items }), leaving out empty ones. Each
 * item is an entry plus `hidden`; hidden built-ins appear only with
 * `showHidden`.
 */
export function savedQueryGroups(state, { showHidden = false } = {}) {
  return SOURCES.map((source) => {
    const entries = source.key === "builtin" ? BUILTIN_QUERIES : state.queries[source.key] ?? [];
    const items = entries
      .map((q) => ({ ...q, hidden: source.key === "builtin" && state.hiddenBuiltins.includes(q.id) }))
      .filter((q) => showHidden || !q.hidden);
    return { ...source, items };
  }).filter((group) => group.items.length);
}

/** Every saved query the menu shows without hidden built-ins, in menu order. */
export function visibleSavedQueries(state) {
  return savedQueryGroups(state).flatMap((group) => group.items);
}

/** How many built-ins are hidden. */
export function hiddenBuiltinCount(state) {
  return BUILTIN_QUERIES.filter((q) => state.hiddenBuiltins.includes(q.id)).length;
}

/** The visible saved query whose query is `text`, or null. */
export function activeSavedQuery(state, text) {
  const query = text.trim();
  if (!query) return null;
  return visibleSavedQueries(state).find((q) => q.query === query) ?? null;
}

/** True when `text` is a valid query (`valid`) that no visible saved query has. */
export function canSaveQuery(state, text, valid) {
  return Boolean(valid && text.trim() && !activeSavedQuery(state, text));
}

/**
 * The project's saved queries from its client settings, in order, skipping
 * unusable values so one bad key does not hide the others.
 */
function parseProjectQueries(settings) {
  const out = [];
  for (const setting of settings ?? []) {
    let value = setting?.value;
    try {
      if (typeof value === "string") value = JSON.parse(value);
    } catch {
      value = null;
    }
    const id = String(setting?.key ?? "").slice(PROJECT_QUERY_PREFIX.length);
    const name = typeof value?.name === "string" ? value.name.trim() : "";
    const query = typeof value?.query === "string" ? value.query.trim() : "";
    if (!id || !name || !query) {
      console.error(`skipping unusable saved query ${setting?.key}`);
      continue;
    }
    out.push({ id, name, query, order: Number.isFinite(value.order) ? value.order : 0 });
  }
  return out.sort((a, b) => a.order - b.order);
}

/** The name a query saved without one gets. */
function defaultName(query) {
  return query.length > UNNAMED_LENGTH ? `${query.slice(0, UNNAMED_LENGTH).trimEnd()}…` : query;
}

export function createSavedQueriesStore(api, { newId = () => crypto.randomUUID() } = {}) {
  const { subscribe, update } = writable(initialState());
  let current = initialState();
  subscribe((state) => (current = state));

  const setSource = (source, entries) =>
    update((state) => ({
      ...state,
      queries: { ...state.queries, [source]: entries.map((q) => ({ ...q, source })) },
    }));

  // The app config's list, without the store's own fields.
  const appList = (entries) => entries.map(({ id, name, query, order }) => ({ id, name, query, order }));
  async function writeApp(entries) {
    const saved = await api.saveAppSavedQueries(appList(entries));
    setSource("app", saved ?? []);
  }

  // One project query per client setting, so a change rewrites only its key.
  const projectKey = (entry) => `${PROJECT_QUERY_PREFIX}${entry.id}`;
  async function writeProject(entry) {
    const { name, query, order } = entry;
    await api.setClientSetting(projectKey(entry), { name, query, order });
    const others = current.queries.project.filter((q) => q.id !== entry.id);
    setSource("project", [...others, entry].sort((a, b) => a.order - b.order));
  }

  // The writable sources. Each change goes to the backend first; the menu
  // changes only once the write succeeds.
  const sources = {
    project: {
      add: writeProject,
      update: writeProject,
      remove: async (entry) => {
        await api.deleteClientSetting(projectKey(entry));
        setSource("project", current.queries.project.filter((q) => q.id !== entry.id));
      },
    },
    app: {
      add: (entry) => writeApp([...current.queries.app, entry]),
      update: (entry) => writeApp(current.queries.app.map((q) => (q.id === entry.id ? entry : q))),
      remove: (entry) => writeApp(current.queries.app.filter((q) => q.id !== entry.id)),
    },
  };

  let projectRun = 0;
  /**
   * Reads the open project's saved queries, replacing the last project's.
   * A newer read wins; a failed read leaves the project with none.
   */
  async function loadProject() {
    const run = ++projectRun;
    let entries = [];
    try {
      entries = parseProjectQueries(await api.listClientSettings(PROJECT_QUERY_PREFIX));
    } catch (error) {
      console.error("reading the project's saved queries:", error);
    }
    if (run === projectRun) setSource("project", entries);
  }

  let loading = null;
  /**
   * Reads the project's saved queries, and the app-wide ones once; later
   * calls share the first app-wide read.
   */
  function load() {
    const project = loadProject();
    loading ??= (async () => {
      try {
        const saved = await api.getAppSavedQueries();
        setSource("app", saved?.queries ?? []);
        update((state) => ({ ...state, hiddenBuiltins: saved?.hidden_builtins ?? [] }));
      } catch (error) {
        console.error("reading saved queries:", error);
        loading = null;
      }
    })();
    return Promise.all([project, loading]).then(() => {});
  }

  /** Saves `query` as `name` in `source`, after its other queries. Resolves to the entry. */
  async function save(name, query, source = "app") {
    const text = query.trim();
    const entry = {
      id: newId(),
      name: name.trim() || defaultName(text),
      query: text,
      order: nextOrder(source),
      source,
    };
    await sources[source].add(entry);
    return entry;
  }

  const nextOrder = (source) => current.queries[source].reduce((max, q) => Math.max(max, q.order + 1), 0);

  /**
   * Moves a saved query to `target` ("project" or "app"), after its
   * queries: writes the new copy, then deletes the old one. If the delete
   * fails the new copy is taken back, so one copy remains, and it rejects.
   */
  async function move(entry, target) {
    if (entry.source === target || !sources[target]) return;
    const { hidden, ...stored } = entry;
    const moved = { ...stored, order: nextOrder(target), source: target };
    await sources[target].add(moved);
    try {
      await sources[entry.source].remove(entry);
    } catch (error) {
      await sources[target].remove(moved).catch((undo) => console.error("taking back a moved query:", undo));
      throw error;
    }
  }

  /** Renames a saved query; a blank name changes nothing. */
  async function rename(entry, name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === entry.name) return;
    const { hidden, ...stored } = entry;
    await sources[entry.source].update({ ...stored, name: trimmed });
  }

  async function remove(entry) {
    await sources[entry.source].remove(entry);
  }

  /** Hides a built-in, or shows it again. */
  async function setBuiltinHidden(id, hidden) {
    const others = current.hiddenBuiltins.filter((h) => h !== id);
    const saved = await api.setHiddenBuiltins(hidden ? [...others, id] : others);
    update((state) => ({ ...state, hiddenBuiltins: saved ?? [] }));
  }

  let countRun = 0;
  /**
   * Counts every saved query's matches, one query at a time so the table's
   * own reads aren't held up, filling state.counts as each returns. Counts
   * from earlier runs are dropped; a newer run stops this one.
   */
  async function loadCounts() {
    const run = ++countRun;
    update((state) => ({ ...state, counts: {} }));
    const queries = [
      ...new Set(savedQueryGroups(current, { showHidden: true }).flatMap((g) => g.items.map((q) => q.query))),
    ];
    for (const query of queries) {
      let count;
      try {
        const result = await api.countMatches(query);
        count = result.QueryError
          ? { error: result.QueryError.Message }
          : { count: result.Count, capped: result.Capped };
      } catch (error) {
        console.error(`counting ${query}:`, error);
      }
      if (run !== countRun) return;
      if (count) update((state) => ({ ...state, counts: { ...state.counts, [query]: count } }));
    }
  }

  return { subscribe, load, loadProject, save, rename, remove, move, setBuiltinHidden, loadCounts };
}
