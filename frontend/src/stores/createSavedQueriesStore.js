// Saved queries: the app-wide ones (the app config YAML), and the built-ins
// that ship with the app, which can be hidden. Backend calls go through the
// injected `api`, so tests run against a fake:
//
//   getAppSavedQueries()        -> { queries: [{ id, name, query, order }], hidden_builtins: [id] }
//   saveAppSavedQueries(list)   -> the saved list, in order
//   setHiddenBuiltins(ids)      -> the saved ids
//   countMatches(query)         -> { Count, Capped, QueryError }
//
// Each writable source is an adapter in `sources` with add, update and
// remove; its entries live in state.queries[source]. A project source
// (client settings `ledger.saved_query.<uuid>`) joins as another adapter and
// another entry in SOURCES.
import { writable } from "svelte/store";

/** The menu's groups, in order. Only "builtin" is read-only. */
export const SOURCES = [
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
    queries: { app: [] },
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

  // The writable sources. Each change goes to the backend first; the menu
  // changes only once the write succeeds.
  const sources = {
    app: {
      add: (entry) => writeApp([...current.queries.app, entry]),
      update: (entry) => writeApp(current.queries.app.map((q) => (q.id === entry.id ? entry : q))),
      remove: (entry) => writeApp(current.queries.app.filter((q) => q.id !== entry.id)),
    },
  };

  let loading = null;
  /** Reads the app-wide saved queries once; later calls share the first read. */
  function load() {
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
    return loading;
  }

  /** Saves `query` as `name` in `source`, after its other queries. Resolves to the entry. */
  async function save(name, query, source = "app") {
    const text = query.trim();
    const entries = current.queries[source];
    const entry = {
      id: newId(),
      name: name.trim() || defaultName(text),
      query: text,
      order: entries.reduce((max, q) => Math.max(max, q.order + 1), 0),
      source,
    };
    await sources[source].add(entry);
    return entry;
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

  return { subscribe, load, save, rename, remove, setBuiltinHidden, loadCounts };
}
