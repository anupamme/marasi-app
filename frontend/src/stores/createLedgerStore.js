// The Ledger store: the live view, the query and its results, the
// content-type exclusion and the table's pages. Every backend call goes
// through the injected `api` (see ledgerStore.js for the Wails one), so this
// module loads under node --test.
//
// The rows the Ledger shows are the query results while a query is active,
// and the live view otherwise. Anything that acts on a row (the drawer, its
// next/previous navigation, the context menu, notes, metadata and highlights)
// must find its pair by ID, never by a row position, because the order and
// contents of the shown rows depend on the active source.
//
// A pair's request number ("Request N") is its position in the live view in
// both modes, so a number always names the same pair.
//
// Query mode is active exactly when the last query that ran successfully is
// non-empty. The content-type exclusion is applied by the queryTraffic call,
// which reads the project's exclusion itself, so it never appears in the
// query. Cursors are opaque strings; "" asks for the first page.
import { writable } from "svelte/store";
import { webSocketMetadataPatch } from "../lib/websocket/metadataPatch.js";

/** How long the query box waits after the last keystroke before running. */
export const QUERY_DELAY_MS = 700;

/** How often query mode checks for new matches after traffic changed. */
export const NEW_MATCHES_POLL_MS = 5000;

/** How often buffered request and response events reach the live view. */
export const FLUSH_INTERVAL_MS = 200;

// Past this many buffered events, they reach the live view at once.
const MAX_BUFFERED = 500;

const DEFAULT_PAGINATION = { pageIndex: 0, pageSize: 100 };

function emptyQueryState(runID = 0) {
  return {
    // The last query that ran successfully; "" in the live view.
    ranQuery: "",
    // Increases each time a query runs successfully, so the ledger can tell a
    // new run from other changes (for example, to go back to page 1).
    runID,
    // The query results loaded so far, newest first.
    items: [],
    // Cursor for the next older page, or null when none exists.
    nextCursor: null,
    indexComplete: true,
    // True while the next older page is being fetched.
    loadingOlder: false,
    // True when fetching an older page failed. Older pages stop loading until
    // the query runs again.
    olderFailed: false,
    // The last failed query: { query, message, position }, where position is
    // marasi's 1-based character offset into `query`, or null when the failure
    // wasn't in the query text. null when the last query that ran was valid.
    error: null,
    // Pairs that match the query but aren't loaded yet, newest first. They
    // join `items` only when merged, so the shown rows don't move.
    newMatches: [],
    // The page the table shows in query mode. The live view keeps its own
    // page in `pagination`, so clearing the query returns to it.
    pageIndex: 0,
  };
}

function initialState(runID = 0) {
  return {
    // The live view, oldest first.
    items: [],
    // Content types the table hides.
    exclusion: [],
    // The live view's page, and the rows per page in both modes.
    pagination: DEFAULT_PAGINATION,
    // The text in the query box.
    queryText: "",
    // True while the query box's delay timer is waiting to run a query.
    queryPending: false,
    query: emptyQueryState(runID),
  };
}

/** True when the query state `q` shows query results instead of the live view. */
export function isQueryActive(q) {
  return q.ranQuery !== "";
}

/** Rows currently shown in the ledger, in source order. */
export function shownRows(state) {
  return isQueryActive(state.query) ? state.query.items : state.items;
}

/**
 * The ledger table's pagination: the rows per page are shared, and the page
 * index belongs to the active mode, so each mode keeps its own page.
 */
export function ledgerPagination(state) {
  return {
    pageSize: state.pagination.pageSize,
    pageIndex: isQueryActive(state.query)
      ? state.query.pageIndex
      : state.pagination.pageIndex,
  };
}

/** True when both are pair IDs and they name the same pair. */
export function sameID(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/** The IDs of `items`, as strings. */
export function pairIDSet(items) {
  return new Set(items.map((item) => String(item.ID)));
}

/** "match" or "matches" for `count`; `more` means there could be more. */
export function matchNoun(count, more = false) {
  return count === 1 && !more ? "match" : "matches";
}

/**
 * "N matches", or "N+ matches" while older pages remain. "" in the live view.
 */
export function matchCountLabel(q) {
  if (!isQueryActive(q)) return "";
  const count = q.items.length;
  const more = q.nextCursor ? "+" : "";
  return `${count.toLocaleString()}${more} ${matchNoun(count, !!more)}`;
}

/** The status line under the query box in query mode; "" in the live view. */
export function queryStatusLabel(q) {
  const label = matchCountLabel(q);
  return label ? `${label} · newest first · column sorting off` : "";
}

/** Shown while a query is active and older traffic is still being indexed. */
export function indexWarning(q) {
  return isQueryActive(q) && !q.indexComplete
    ? "Indexing older traffic — text matches may be incomplete"
    : "";
}

/**
 * True when the ledger, showing `pageIndex` at `pageSize` rows per page, is on
 * the last loaded page of query results while older pages remain.
 */
export function needsOlderPage(q, pageIndex, pageSize) {
  if (!isQueryActive(q) || !q.nextCursor || q.loadingOlder || q.olderFailed)
    return false;
  const lastLoaded = Math.max(Math.ceil(q.items.length / pageSize) - 1, 0);
  return pageIndex >= lastLoaded;
}

/**
 * Splits an invalid query around marasi's 1-based error position, counting
 * characters rather than UTF-16 units, so the problem can be marked:
 * { before, at, after }. `at` is a space when the position is past the end.
 * Returns null when the error has no position.
 */
export function markQueryError(error) {
  if (!error?.position) return null;
  const chars = Array.from(error.query);
  const index = Math.min(Math.max(error.position - 1, 0), chars.length);
  return {
    before: chars.slice(0, index).join(""),
    at: chars[index] ?? " ",
    after: chars.slice(index + 1).join(""),
  };
}

/**
 * A readable of `selector(state)` that notifies its subscribers only when the
 * selected value changes, so a component can follow one part of the store
 * without updating on every other change.
 */
export function select(store, selector) {
  return {
    subscribe(run) {
      let first = true;
      let last;
      return store.subscribe((state) => {
        const value = selector(state);
        if (first || value !== last) {
          first = false;
          last = value;
          run(value);
        }
      });
    },
  };
}

// Pair IDs are UUIDv7 strings, so comparing them as strings orders pairs by
// capture time, the same order marasi returns query results in.
function newestFirst(a, b) {
  const x = String(a.ID);
  const y = String(b.ID);
  return x < y ? 1 : x > y ? -1 : 0;
}

// Merges `patch` into the Metadata of the pair with this ID in `list`.
function patchListMetadata(list, id, patch) {
  let changed = false;
  const patched = list.map((item) => {
    if (!sameID(item.ID, id)) return item;
    changed = true;
    return { ...item, Metadata: { ...(item.Metadata || {}), ...patch } };
  });
  return changed ? patched : list;
}

export function createLedgerStore(api) {
  let projectStateVersion = 0;
  let current = initialState();
  const { subscribe, set: setStore } = writable(current);

  function set(next) {
    current = next;
    setStore(next);
  }
  function update(fn) {
    set(fn(current));
  }
  function updateQuery(fn) {
    update((state) => ({ ...state, query: fn(state.query) }));
  }

  // Request and response events wait here until the next flush, so a burst
  // of traffic updates the live view once.
  let requestBuffer = [];
  let responseBuffer = new Map();

  // Set by request and response events and by edits made in the app; cleared
  // when the newest page of the query is fetched.
  let trafficChanged = false;

  let delayTimer = null;
  // Identifies the newest query request, so a slower, older response can't
  // overwrite a newer one or a cleared query.
  let latestRequest = 0;

  function cancelDelay() {
    clearTimeout(delayTimer);
    delayTimer = null;
    if (current.queryPending) update((state) => ({ ...state, queryPending: false }));
  }

  // Live-view numbers by pair ID, extended as pairs are appended to the live
  // view and rebuilt when it is replaced, so lookups stay cheap per table cell.
  const numbering = { items: null, counted: 0, numbers: new Map() };

  function liveViewNumber(id) {
    const items = current.items;
    if (items !== numbering.items || items.length < numbering.counted) {
      numbering.items = items;
      numbering.counted = 0;
      numbering.numbers = new Map();
    }
    for (let i = numbering.counted; i < items.length; i++) {
      numbering.numbers.set(String(items[i].ID), i + 1);
    }
    numbering.counted = items.length;
    return numbering.numbers.get(String(id));
  }

  /** The shown pair with this ID, or undefined. */
  function findShownPair(id) {
    return shownRows(current).find((item) => sameID(item.ID, id));
  }

  /**
   * The pair's request number as the ledger displays it ("Request N"): its
   * position in the live view, in both modes. A pair that hasn't reached the
   * live view yet, such as one captured moments ago, gets "?" rather than a
   * number that names a different pair.
   */
  function pairNumber(id) {
    return liveViewNumber(id) ?? "?";
  }

  /**
   * The shown pair whose request number is `number`, or undefined when no
   * pair has that number or the ledger isn't showing it.
   */
  function shownPairAtNumber(number) {
    const pair = current.items[number - 1];
    return pair && findShownPair(pair.ID);
  }

  // Loads the project's live view and content-type exclusion. Each arrives on
  // its own; a failure leaves the other in place.
  async function populate() {
    const version = projectStateVersion;
    const fresh = () => version === projectStateVersion;
    await Promise.all([
      api
        .getLiveView()
        .then((items) => {
          if (fresh()) update((state) => ({ ...state, items: items ?? [] }));
        })
        .catch((err) => console.error("Loading the live view failed:", err)),
      api
        .getExclusion()
        .then((exclusion) => {
          if (fresh()) update((state) => ({ ...state, exclusion: exclusion ?? [] }));
        })
        .catch((err) => console.error("Loading the content-type exclusion failed:", err)),
    ]);
  }

  /**
   * Moves buffered requests and responses into the live view, fills in the
   * responses for loaded query results, and records that traffic changed.
   */
  function flush() {
    if (requestBuffer.length === 0 && responseBuffer.size === 0) return;
    const requests = requestBuffer;
    const responses = responseBuffer;
    requestBuffer = [];
    responseBuffer = new Map();

    update((state) => {
      let items = state.items;
      if (responses.size > 0 && items.length > 0) {
        items = items.map((item) =>
          responses.has(item.ID) ? { ...item, ...responses.get(item.ID) } : item,
        );
      }
      if (requests.length > 0) {
        const arrived = requests.map((req) =>
          responses.has(req.ID) ? { ...req, ...responses.get(req.ID) } : req,
        );
        items = [...items, ...arrived];
      }
      return { ...state, items };
    });

    // Responses also fill in loaded query results, in place by pair ID. Rows
    // are never removed, even when they no longer match.
    if (responses.size > 0 && isQueryActive(current.query)) {
      patchQueryResults((item) => {
        const res = responses.get(item.ID);
        return res ? { ...item, ...res } : item;
      });
    }
    trafficChanged = true;
  }

  /**
   * Applies `fn(item)` to every loaded query result and new match. `fn`
   * returns the item itself to leave it alone, or a replacement. Subscribers
   * are notified only when something was replaced.
   */
  function patchQueryResults(fn) {
    let changed = false;
    const patchList = (list) =>
      list.map((item) => {
        const patched = fn(item);
        if (patched !== item) changed = true;
        return patched;
      });
    const q = current.query;
    const items = patchList(q.items);
    const newMatches = patchList(q.newMatches);
    if (changed) updateQuery((q) => ({ ...q, items, newMatches }));
  }

  /**
   * Merges `patch` into the Metadata of the pair with this ID, in the live
   * view and in the loaded query results and new matches. A source that
   * doesn't hold the pair is left alone. The edit can change what the query
   * matches, so it also marks traffic as changed.
   */
  function patchMetadata(id, patch) {
    update((state) => ({
      ...state,
      items: patchListMetadata(state.items, id, patch),
      query: {
        ...state.query,
        items: patchListMetadata(state.query.items, id, patch),
        newMatches: patchListMetadata(state.query.newMatches, id, patch),
      },
    }));
    trafficChanged = true;
  }

  /**
   * Runs `text` as the ledger's query now. Blank text returns to the live
   * view instead, because an empty query is never sent. An invalid query
   * records the error and leaves the previous results in place.
   */
  async function runQuery(text = current.queryText) {
    cancelDelay();
    if (text.trim() === "") {
      clearQuery({ keepText: true });
      return;
    }
    const request = ++latestRequest;
    let result;
    let failure = null;
    try {
      result = await api.queryTraffic(text, "");
      if (result.QueryError) {
        failure = {
          message: result.QueryError.Message,
          position: result.QueryError.Position,
        };
      }
    } catch (err) {
      console.error("Querying traffic failed:", err);
      failure = { message: String(err), position: null };
    }
    if (request !== latestRequest) return;
    if (failure) {
      updateQuery((q) => ({ ...q, error: { query: text, ...failure } }));
      return;
    }
    trafficChanged = false;
    updateQuery((q) => ({
      ...q,
      ranQuery: text,
      runID: q.runID + 1,
      items: result.Items ?? [],
      nextCursor: result.NextCursor ?? null,
      indexComplete: result.IndexComplete,
      loadingOlder: false,
      olderFailed: false,
      error: null,
      newMatches: [],
      pageIndex: 0,
    }));
  }

  /** Runs the query box's text once it has been left alone for the delay. */
  function scheduleQuery(text = current.queryText) {
    cancelDelay();
    if (text.trim() === "") {
      clearQuery({ keepText: true });
      return;
    }
    update((state) => ({ ...state, queryPending: true }));
    delayTimer = setTimeout(() => runQuery(text), QUERY_DELAY_MS);
  }

  /**
   * Runs the active query again, for example after the content-type
   * exclusion changed. Does nothing in the live view.
   */
  function rerunQuery() {
    if (isQueryActive(current.query)) return runQuery(current.query.ranQuery);
  }

  /**
   * Returns to the live view: empties the query box (unless `keepText`),
   * drops the query results and ignores any query still in flight.
   */
  function clearQuery({ keepText = false } = {}) {
    cancelDelay();
    latestRequest++;
    update((state) => ({
      ...state,
      queryText: keepText ? state.queryText : "",
      query: emptyQueryState(state.query.runID),
    }));
  }

  /**
   * Fetches the next older page of query results from the cursor and appends
   * it. The page can come back short or empty while a cursor remains,
   * because some content-type exclusions are applied after marasi returns
   * the page; the caller asks again while `needsOlderPage` holds. A result
   * that arrives after the query ran again or was cleared is dropped.
   */
  async function loadOlderPage() {
    const start = current.query;
    if (!isQueryActive(start) || !start.nextCursor || start.loadingOlder) return;
    const isCurrent = (q) =>
      q.runID === start.runID &&
      q.ranQuery === start.ranQuery &&
      q.nextCursor === start.nextCursor;
    updateQuery((q) => ({ ...q, loadingOlder: true }));
    let result;
    try {
      result = await api.queryTraffic(start.ranQuery, start.nextCursor);
      if (result.QueryError) throw new Error(result.QueryError.Message);
    } catch (err) {
      console.error("Loading older query results failed:", err);
      updateQuery((q) =>
        isCurrent(q) ? { ...q, loadingOlder: false, olderFailed: true } : q,
      );
      return;
    }
    updateQuery((q) => {
      if (!isCurrent(q)) return q;
      const loaded = pairIDSet(q.items);
      const older = (result.Items ?? []).filter((it) => !loaded.has(String(it.ID)));
      return {
        ...q,
        items: [...q.items, ...older],
        nextCursor: result.NextCursor ?? null,
        indexComplete: result.IndexComplete,
        loadingOlder: false,
      };
    });
  }

  /**
   * Checks for new matches when traffic changed since the last check:
   * fetches the newest page of the active query and keeps the pairs that
   * aren't loaded as new matches. Pairs older than the next page's cursor are
   * left out, because loading older pages brings them in. Does nothing in the
   * live view or when traffic hasn't changed.
   */
  async function checkForNewMatches() {
    const start = current.query;
    if (!isQueryActive(start) || !trafficChanged) return;
    const { ranQuery, runID } = start;
    trafficChanged = false;
    let result;
    try {
      result = await api.queryTraffic(ranQuery, "");
    } catch (err) {
      console.error("Checking for new matches failed:", err);
      trafficChanged = true;
      return;
    }
    if (result.QueryError) return;
    updateQuery((q) => {
      // A different query ran, or the ledger went back to the live view.
      if (q.ranQuery !== ranQuery || q.runID !== runID) return q;
      const loaded = pairIDSet(q.items);
      // The cursor is opaque; the oldest loaded pair marks where the next
      // page starts. Pair ids are UUIDv7, so they sort by capture time.
      const oldestLoaded = q.items.length
        ? q.items.reduce(
            (min, item) => (String(item.ID) < min ? String(item.ID) : min),
            String(q.items[0].ID),
          )
        : null;
      const isNew = (item) =>
        !loaded.has(String(item.ID)) &&
        (q.nextCursor == null || String(item.ID) > oldestLoaded);
      const fresh = (result.Items ?? []).filter(isNew);
      const freshIDs = pairIDSet(fresh);
      // Earlier new matches can fall off the newest page when a lot of
      // traffic arrives; keep them.
      const kept = q.newMatches.filter(
        (item) => isNew(item) && !freshIDs.has(String(item.ID)),
      );
      return {
        ...q,
        newMatches: [...fresh, ...kept].sort(newestFirst),
        indexComplete: result.IndexComplete,
      };
    });
  }

  /**
   * Merges the new matches into the query results in newest-first order and
   * goes back to page 1 of the query results.
   */
  function mergeNewMatches() {
    if (current.query.newMatches.length === 0) return;
    updateQuery((q) => ({
      ...q,
      items: [...q.items, ...q.newMatches].sort(newestFirst),
      newMatches: [],
      pageIndex: 0,
    }));
  }

  /** Changes the ledger table's pagination (a value or TanStack updater). */
  function setPagination(updater) {
    const next =
      updater instanceof Function ? updater(ledgerPagination(current)) : updater;
    update((state) =>
      isQueryActive(state.query)
        ? {
            ...state,
            pagination: { ...state.pagination, pageSize: next.pageSize },
            query: { ...state.query, pageIndex: next.pageIndex },
          }
        : {
            ...state,
            pagination: { pageIndex: next.pageIndex, pageSize: next.pageSize },
          },
    );
  }

  return {
    subscribe,
    clear: () => {
      projectStateVersion++;
      cancelDelay();
      latestRequest++;
      requestBuffer = [];
      responseBuffer = new Map();
      trafficChanged = false;
      set(initialState(current.query.runID));
    },
    populate,

    // Traffic events. They reach the live view on the next flush, or at once
    // when the buffer is full.
    onRequest: (req) => {
      requestBuffer.push(req);
      if (requestBuffer.length > MAX_BUFFERED) flush();
    },
    onResponse: (res) => {
      responseBuffer.set(res.ID, res);
      if (responseBuffer.size > MAX_BUFFERED) flush();
    },
    flush,
    // A ws-open, ws-close or ws-state event changes its upgrade row.
    patchWebSocketMetadata: (conn) => {
      if (!conn?.RequestID) return;
      // The upgrade request may still be waiting in the buffer; a failed
      // handshake's ws-state arrives right behind it.
      flush();
      patchMetadata(conn.RequestID, webSocketMetadataPatch(conn));
    },
    patchMetadata,
    /**
     * Records that traffic changed: a request or response arrived, or a pair
     * was edited in the app. The next poll in query mode then checks for new
     * matches.
     */
    markTrafficChanged: () => {
      trafficChanged = true;
    },

    setQueryText: (queryText) => update((state) => ({ ...state, queryText })),
    runQuery,
    scheduleQuery,
    rerunQuery,
    clearQuery,
    loadOlderPage,
    checkForNewMatches,
    mergeNewMatches,
    setPagination,

    // Stores the content-type exclusion and goes back to the first page,
    // then runs the active query again so its results reflect it.
    saveExclusion: async (types) => {
      update((state) => ({ ...state, exclusion: [...types] }));
      setPagination((old) => ({ ...old, pageIndex: 0 }));
      await api.setExclusion(types);
      await rerunQuery();
    },

    findShownPair,
    pairNumber,
    shownPairAtNumber,

    getDetails: (id) => api.getRawDetails(id),
    getMetadata: (id) => api.getMetadata(id),
    getNote: (id) => api.getNote(id),
    // Highlights the pair with a 0xRRGGBB colour, or clears it with -1.
    highlight: async (id, color) => {
      await api.highlight(id, color);
      patchMetadata(id, {
        highlight: color < 0 ? "" : "#" + color.toString(16).padStart(6, "0"),
      });
    },
    // Creates a launchpad named after the pair's request number and links
    // the pair to it. Returns the launchpad's id.
    sendToLaunchpad: async (id) => {
      const index = pairNumber(id);
      const launchpadId = await api.createLaunchpad(
        "Request " + index,
        "Launchpad for Request " + index,
      );
      await api.linkToLaunchpad(id, launchpadId);
      // Linking edits the pair's metadata.
      trafficChanged = true;
      return launchpadId;
    },
  };
}
