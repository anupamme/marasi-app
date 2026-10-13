// The Launchpad store: launchpads, their entries, and one Launchpad draft per
// launchpad. Every backend call goes through the injected `api` (see
// launchpadStore.js for the Wails one), so this module loads under node --test.
import { writable } from "svelte/store";
import { COMPARE_SIDES } from "../lib/launchpad/compare.js";

// The draft an empty launchpad starts from.
export const BLANK_REQUEST = "GET / HTTP/1.1\nHost: \n\n";

// How long a Launch waits for its entry to arrive before it stops being
// pending. Arrival is asynchronous (Marasi ADR-0011) and some launches, such
// as WebSocket upgrades, never produce a normal request/response pair.
export const LAUNCH_TIMEOUT_MS = 15000;

// The state maps keyed by launchpad id. A deleted launchpad leaves all of them.
const PER_LAUNCHPAD_KEYS = [
  "entriesByLaunchpad",
  "selectedEntryByLaunchpad",
  "draftsByLaunchpad",
  "pendingLaunchByLaunchpad",
  "unseenByLaunchpad",
];

function initialState(projectStateVersion = 0) {
  return {
    projectStateVersion,
    launchpads: [],
    ...Object.fromEntries(PER_LAUNCHPAD_KEYS.map((key) => [key, {}])),
    detailsById: {},
    selectedLaunchpadId: null,
    search: "",
    compare: null,
  };
}

// Applies `fn` to every per-launchpad map in state.
function mapPerLaunchpad(state, fn) {
  return Object.fromEntries(
    PER_LAUNCHPAD_KEYS.map((key) => [key, fn(state[key])]),
  );
}

// A Launchpad draft: the raw request, the entry it was seeded from (null for
// a blank one), and whether it launches over HTTPS.
function makeDraft(raw, seededFrom, previous) {
  return { raw, seededFrom, useHttps: previous?.useHttps ?? true };
}

// CodeMirror rewrites \r\n to \n, so drafts compare without them.
const normalise = (raw) => (raw ?? "").replace(/\r\n/g, "\n");

/** The raw request a launchpad's draft was seeded from. */
export function seededRaw(state, launchpadId) {
  const draft = state.draftsByLaunchpad[launchpadId];
  if (!draft?.seededFrom) return BLANK_REQUEST;
  return state.detailsById[draft.seededFrom]?.Request?.Raw ?? "";
}

/** True when the launchpad's draft differs from the request it was seeded from. */
export function isDraftDirty(state, launchpadId) {
  const draft = state.draftsByLaunchpad[launchpadId];
  if (!draft) return false;
  if (draft.seededFrom && !state.detailsById[draft.seededFrom]) return false;
  return normalise(draft.raw) !== normalise(seededRaw(state, launchpadId));
}

/** IDs of launchpads whose draft would be lost by closing the project. */
export function dirtyLaunchpadIds(state) {
  return Object.keys(state.draftsByLaunchpad).filter((id) =>
    isDraftDirty(state, id),
  );
}

function without(map, key) {
  const copy = { ...map };
  delete copy[key];
  return copy;
}

// The entry-list row for a request that has not been answered yet.
function entryFromRequest(request) {
  return {
    ID: request.ID,
    Scheme: request.Scheme,
    Method: request.Method,
    Host: request.Host,
    Path: request.Path,
    Status: "",
    StatusCode: 0,
    ContentType: "",
    Length: "",
    Metadata: request.Metadata || {},
    RequestedAt: request.RequestedAt,
    RespondedAt: null,
    Note: "",
  };
}

// A request from the layout's "request" event. Launched requests carry their
// launchpad in Metadata.launchpad_id; anything else is ignored.
function arriveRequest(state, request) {
  const launchpadId = request?.Metadata?.launchpad_id;
  if (!launchpadId) return state;
  if (!state.launchpads.some((launchpad) => launchpad.ID === launchpadId)) {
    return state;
  }
  const entries = state.entriesByLaunchpad[launchpadId];
  const next = {
    ...state,
    detailsById: {
      ...state.detailsById,
      [request.ID]: { Request: request, Response: null, Metadata: {} },
    },
    // Unloaded entry lists pick the request up when they load.
    entriesByLaunchpad: entries
      ? {
          ...state.entriesByLaunchpad,
          [launchpadId]: [...entries, entryFromRequest(request)],
        }
      : state.entriesByLaunchpad,
    unseenByLaunchpad:
      launchpadId === state.selectedLaunchpadId
        ? state.unseenByLaunchpad
        : {
            ...state.unseenByLaunchpad,
            [launchpadId]: (state.unseenByLaunchpad[launchpadId] || 0) + 1,
          },
  };

  const pending = state.pendingLaunchByLaunchpad[launchpadId];
  if (!pending) return next;
  // The first arrival after a Launch is the launched entry: select it and
  // reseed the draft from it, unless the researcher kept typing.
  const draft = state.draftsByLaunchpad[launchpadId];
  return {
    ...next,
    pendingLaunchByLaunchpad: without(state.pendingLaunchByLaunchpad, launchpadId),
    selectedEntryByLaunchpad: {
      ...state.selectedEntryByLaunchpad,
      [launchpadId]: request.ID,
    },
    draftsByLaunchpad: {
      ...state.draftsByLaunchpad,
      [launchpadId]: makeDraft(
        draft?.raw === pending.raw ? request.Raw : draft?.raw,
        request.ID,
        draft,
      ),
    },
  };
}

// A response from the layout's "response" event, matched to an arrived request.
function arriveResponse(state, response) {
  const details = state.detailsById[response?.ID];
  const launchpadId = details?.Request?.Metadata?.launchpad_id;
  if (!launchpadId) return state;
  const entries = state.entriesByLaunchpad[launchpadId];
  return {
    ...state,
    detailsById: {
      ...state.detailsById,
      [response.ID]: { ...details, Response: response },
    },
    entriesByLaunchpad: entries
      ? {
          ...state.entriesByLaunchpad,
          [launchpadId]: entries.map((entry) =>
            entry.ID === response.ID
              ? {
                  ...entry,
                  Status: response.Status,
                  StatusCode: response.StatusCode,
                  ContentType: response.ContentType,
                  Length: response.Length,
                  RespondedAt: response.RespondedAt,
                }
              : entry,
          ),
        }
      : state.entriesByLaunchpad,
  };
}

export function createLaunchpadStore(
  api,
  { setTimer = setTimeout, clearTimer = clearTimeout } = {},
) {
  let projectStateVersion = 0;
  // The fallback timer of each pending Launch, by launchpad id.
  const launchTimers = new Map();

  function stopLaunchTimer(launchpadId) {
    if (!launchTimers.has(launchpadId)) return;
    clearTimer(launchTimers.get(launchpadId));
    launchTimers.delete(launchpadId);
  }

  // Ends this Launch's pending state, unless a newer Launch replaced it.
  function clearPending(launchpadId, pending) {
    if (current.pendingLaunchByLaunchpad[launchpadId] !== pending) return;
    stopLaunchTimer(launchpadId);
    update((state) => ({
      ...state,
      pendingLaunchByLaunchpad: without(state.pendingLaunchByLaunchpad, launchpadId),
    }));
  }
  let current = initialState();
  const { subscribe, set: setStore } = writable(current);

  function set(next) {
    current = next;
    setStore(next);
  }
  function update(fn) {
    set(fn(current));
  }

  async function ensureDetails(id) {
    if (!id || current.detailsById[id]) return current.detailsById[id];
    const version = projectStateVersion;
    const row = await api.getRawDetails(id);
    if (version !== projectStateVersion || !row) return row;
    update((state) => ({
      ...state,
      detailsById: { ...state.detailsById, [id]: row },
    }));
    return row;
  }

  async function loadEntries(launchpadId) {
    const version = projectStateVersion;
    const entries = (await api.getEntries(launchpadId)) || [];
    if (version !== projectStateVersion) return [];
    update((state) => ({
      ...state,
      entriesByLaunchpad: { ...state.entriesByLaunchpad, [launchpadId]: entries },
    }));
    return entries;
  }

  // Selects the entry and replaces the launchpad's draft with its request.
  async function seedDraft(launchpadId, entryId) {
    const version = projectStateVersion;
    const row = await ensureDetails(entryId);
    if (version !== projectStateVersion) return;
    update((state) => ({
      ...state,
      selectedEntryByLaunchpad: {
        ...state.selectedEntryByLaunchpad,
        [launchpadId]: entryId,
      },
      draftsByLaunchpad: {
        ...state.draftsByLaunchpad,
        [launchpadId]: makeDraft(
          row?.Request?.Raw ?? "",
          entryId,
          state.draftsByLaunchpad[launchpadId],
        ),
      },
    }));
  }

  // Opens the launchpad without seeding: its unseen arrivals count as seen.
  function openLaunchpad(launchpadId) {
    update((state) => ({
      ...state,
      selectedLaunchpadId: launchpadId,
      compare: null,
      unseenByLaunchpad: launchpadId
        ? { ...state.unseenByLaunchpad, [launchpadId]: 0 }
        : state.unseenByLaunchpad,
    }));
  }

  async function selectLaunchpad(launchpadId) {
    openLaunchpad(launchpadId);
    if (!launchpadId) return;
    const version = projectStateVersion;
    const entries =
      current.entriesByLaunchpad[launchpadId] ?? (await loadEntries(launchpadId));
    if (version !== projectStateVersion) return;
    // A draft survives launchpad switches; only a missing one is seeded.
    if (current.draftsByLaunchpad[launchpadId]) return;
    if (entries.length > 0) {
      await seedDraft(launchpadId, entries[entries.length - 1].ID);
      return;
    }
    update((state) => ({
      ...state,
      draftsByLaunchpad: {
        ...state.draftsByLaunchpad,
        [launchpadId]: makeDraft(BLANK_REQUEST, null),
      },
    }));
  }

  // Returns { needsConfirm: true } instead of replacing a dirty draft.
  // Re-selecting the entry a dirty draft came from keeps the draft.
  async function selectEntry(launchpadId, entryId, { force = false } = {}) {
    const draft = current.draftsByLaunchpad[launchpadId];
    const dirty = isDraftDirty(current, launchpadId);
    const sameEntry = draft?.seededFrom === entryId;
    if (!force && !sameEntry && dirty) {
      return { needsConfirm: true };
    }
    if (current.selectedLaunchpadId !== launchpadId) {
      openLaunchpad(launchpadId);
      if (!current.entriesByLaunchpad[launchpadId]) await loadEntries(launchpadId);
    }
    if (sameEntry && dirty) {
      update((state) => ({
        ...state,
        selectedEntryByLaunchpad: {
          ...state.selectedEntryByLaunchpad,
          [launchpadId]: entryId,
        },
      }));
      return { needsConfirm: false };
    }
    await seedDraft(launchpadId, entryId);
    return { needsConfirm: false };
  }

  function updateDraftFields(launchpadId, fields) {
    update((state) => {
      const draft = state.draftsByLaunchpad[launchpadId];
      if (!draft) return state;
      return {
        ...state,
        draftsByLaunchpad: {
          ...state.draftsByLaunchpad,
          [launchpadId]: { ...draft, ...fields },
        },
      };
    });
  }

  function updateCompare(fields) {
    update((state) =>
      state.compare
        ? { ...state, compare: { ...state.compare, ...fields } }
        : state,
    );
  }

  // Loads the launchpad list. Drafts, entries and selection of launchpads
  // that still exist are kept, so the page can call this on every visit.
  async function populate() {
    const version = projectStateVersion;
    const launchpads = (await api.getLaunchpads()) || [];
    if (version !== projectStateVersion) return;
    update((state) => {
      const ids = new Set(launchpads.map((launchpad) => launchpad.ID));
      const keep = (map) =>
        Object.fromEntries(Object.entries(map).filter(([id]) => ids.has(id)));
      return {
        ...state,
        launchpads,
        ...mapPerLaunchpad(state, keep),
        compare: ids.has(state.compare?.launchpadId) ? state.compare : null,
      };
    });
    const selected = launchpads.some(
      (launchpad) => launchpad.ID === current.selectedLaunchpadId,
    )
      ? current.selectedLaunchpadId
      : launchpads[0]?.ID ?? null;
    await selectLaunchpad(selected);
  }

  return {
    subscribe,
    clear: () => {
      [...launchTimers.keys()].forEach(stopLaunchTimer);
      set(initialState(++projectStateVersion));
    },
    populate,
    loadEntries,
    // The tree's counts and last statuses need every entry list; the
    // backend has no summary field, so this loads the missing ones.
    loadAllEntries: async () => {
      const missing = current.launchpads.filter(
        (launchpad) => !current.entriesByLaunchpad[launchpad.ID],
      );
      await Promise.all(missing.map((launchpad) => loadEntries(launchpad.ID)));
    },
    ensureDetails,
    selectLaunchpad,
    selectEntry,

    updateDraft: (launchpadId, raw) => {
      if (current.draftsByLaunchpad[launchpadId]?.raw === raw) return;
      updateDraftFields(launchpadId, { raw });
    },
    revertDraft: (launchpadId) =>
      updateDraftFields(launchpadId, { raw: seededRaw(current, launchpadId) }),
    setUseHttps: (launchpadId, useHttps) =>
      updateDraftFields(launchpadId, { useHttps }),

    // Launch is fire-and-forget (Marasi ADR-0011): the new entry arrives
    // later through onRequest, tagged with Metadata.launchpad_id. A launch
    // that fails, or whose entry does not arrive in time, stops pending.
    launch: async (launchpadId) => {
      const draft = current.draftsByLaunchpad[launchpadId];
      if (!draft) return;
      const pending = { raw: draft.raw };
      stopLaunchTimer(launchpadId);
      update((state) => ({
        ...state,
        pendingLaunchByLaunchpad: {
          ...state.pendingLaunchByLaunchpad,
          [launchpadId]: pending,
        },
      }));
      launchTimers.set(
        launchpadId,
        setTimer(() => clearPending(launchpadId, pending), LAUNCH_TIMEOUT_MS),
      );
      try {
        await api.launch(draft.raw, launchpadId, draft.useHttps);
      } catch (error) {
        clearPending(launchpadId, pending);
        throw error;
      }
    },

    setSearch: (search) => update((state) => ({ ...state, search })),

    createLaunchpad: async ({ name, description = "" }) => {
      const id = await api.createLaunchpad(name, description);
      update((state) => ({
        ...state,
        launchpads: [...state.launchpads, { ID: id, Name: name, Description: description }],
        entriesByLaunchpad: { ...state.entriesByLaunchpad, [id]: [] },
      }));
      await selectLaunchpad(id);
      return id;
    },

    updateLaunchpad: async (id, { name, description = "" }) => {
      await api.updateLaunchpad(id, name, description);
      update((state) => ({
        ...state,
        launchpads: state.launchpads.map((launchpad) =>
          launchpad.ID === id
            ? { ...launchpad, Name: name, Description: description }
            : launchpad,
        ),
      }));
    },

    // Deletes without asking: confirming a dirty draft is the page's job.
    deleteLaunchpad: async (id) => {
      await api.deleteLaunchpad(id);
      const index = current.launchpads.findIndex((launchpad) => launchpad.ID === id);
      stopLaunchTimer(id);
      update((state) => ({
        ...state,
        launchpads: state.launchpads.filter((launchpad) => launchpad.ID !== id),
        ...mapPerLaunchpad(state, (map) => without(map, id)),
        compare: state.compare?.launchpadId === id ? null : state.compare,
      }));
      if (current.selectedLaunchpadId !== id) return;
      const neighbour =
        current.launchpads[Math.min(index, current.launchpads.length - 1)];
      await selectLaunchpad(neighbour?.ID ?? null);
    },

    onRequest: (request) => {
      update((state) => arriveRequest(state, request));
      const launchpadId = request?.Metadata?.launchpad_id;
      if (launchpadId && !current.pendingLaunchByLaunchpad[launchpadId]) {
        stopLaunchTimer(launchpadId);
      }
    },
    onResponse: (response) => update((state) => arriveResponse(state, response)),

    // Compare starts from an entry of the open launchpad as A. `picking`
    // names the side the next entry click fills.
    startCompare: async (leftId) => {
      const launchpadId = current.selectedLaunchpadId;
      if (!launchpadId) return;
      await ensureDetails(leftId);
      update((state) => ({
        ...state,
        compare: { launchpadId, leftId, rightId: null, picking: "right" },
      }));
    },
    pickCompareSide: (side) => updateCompare({ picking: side }),
    setCompareSide: async (side, entryId) => {
      await ensureDetails(entryId);
      updateCompare({
        [COMPARE_SIDES[side].key]: entryId,
        picking: null,
      });
    },
    swapCompare: () =>
      update((state) =>
        state.compare
          ? {
              ...state,
              compare: {
                ...state.compare,
                leftId: state.compare.rightId,
                rightId: state.compare.leftId,
              },
            }
          : state,
      ),
    closeCompare: () => update((state) => ({ ...state, compare: null })),
  };
}
