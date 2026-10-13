// Rows of the Launchpad file tree. Every function here is pure: whatever it
// reads is an argument, so Svelte re-renders whenever grouping, paging, open
// folders or the selection change.

/** Entries a list shows before its "earlier entries" row. */
export const WINDOW = 10;
/** Entries one "Show more" click reveals. */
export const STEP = 50;

// The latest `shown` rows of one list, preceded by an "earlier" row. The
// window widens so the selected entry is never hidden.
function windowed(rows, list, depth, shown, label, selectedEntryId) {
  const selected = rows.findIndex((row) => row.entry.ID === selectedEntryId);
  const hidden = Math.max(0, Math.min(rows.length - shown, selected < 0 ? Infinity : selected));
  const latest = rows.slice(hidden).map((row) => ({ ...row, depth, list, label }));
  if (!hidden) return latest;
  return [{ kind: "more", list, hidden, total: rows.length, depth }, ...latest];
}

const entryText = (entry) =>
  `${entry.Method} ${entry.Host}${entry.Path} ${entry.StatusCode || ""}`.toLowerCase();

/**
 * The launchpads the tree lists for `state.search`. A name or description
 * match lists the whole launchpad (`matchedEntries: null`); otherwise only
 * the current launchpad's entries are searched, and a launchpad with
 * matching entries lists just those.
 */
export function searchLaunchpads({ search, launchpads, entriesByLaunchpad, selectedLaunchpadId }) {
  const query = search.trim().toLowerCase();
  const results = [];
  for (const launchpad of launchpads) {
    const entries = entriesByLaunchpad[launchpad.ID] || [];
    if (!query || `${launchpad.Name} ${launchpad.Description}`.toLowerCase().includes(query)) {
      results.push({ launchpad, entries, matchedEntries: null });
      continue;
    }
    if (launchpad.ID !== selectedLaunchpadId) continue;
    const matchedEntries = entries.filter((entry) => entryText(entry).includes(query));
    if (matchedEntries.length) results.push({ launchpad, entries, matchedEntries });
  }
  return results;
}

/** Entry count and the last entry's status; nulls while entries are unloaded. */
export function launchpadSummary(entries) {
  if (!entries) return { count: null, lastStatus: null };
  return { count: entries.length, lastStatus: entries.at(-1)?.StatusCode ?? null };
}

/** The status folder an entry belongs to; unanswered entries are "pending". */
export const statusKey = (entry) => (entry.StatusCode ? String(entry.StatusCode) : "pending");

const byStatus = (a, b) =>
  a === "pending" ? 1 : b === "pending" ? -1 : Number(a) - Number(b);

/**
 * The rows under one open launchpad: its original entry, then the rest of
 * its Launchpad entries, windowed to the latest `WINDOW` (plus whatever
 * `shownByList[list]` adds, and widened to keep `selectedEntryId` in view).
 * With `groupByStatus`, the rest are filed into
 * status folders, each windowed the same way. A folder is open when
 * `openGroups` says so, else when it holds `selectedEntryId`.
 */
export function entryRows(options) {
  return markLast(buildRows(options));
}

// Flags the final entry row of each list; the Latest-in button scrolls to it.
function markLast(rows) {
  const seen = new Set();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const { kind, list } = rows[i];
    if (kind !== "entry" || !list || seen.has(list)) continue;
    seen.add(list);
    rows[i] = { ...rows[i], last: true };
  }
  return rows;
}

function buildRows({
  launchpad,
  entries,
  matchedEntries = null,
  groupByStatus = false,
  shownByList = {},
  openGroups = {},
  selectedEntryId = null,
}) {
  const indexed = entries.map((entry, index) => ({ kind: "entry", entry, index }));
  if (matchedEntries) {
    const keep = new Set(matchedEntries.map((entry) => entry.ID));
    return indexed.filter((row) => keep.has(row.entry.ID)).map((row) => ({ ...row, depth: 1 }));
  }
  if (indexed.length === 0) return [];
  const original = { ...indexed[0], depth: 1, list: launchpad.ID, label: launchpad.Name };
  const rest = indexed.slice(1);
  const shown = (list) => shownByList[list] ?? WINDOW;
  if (!groupByStatus) {
    return [
      original,
      ...windowed(rest, launchpad.ID, 1, shown(launchpad.ID), launchpad.Name, selectedEntryId),
    ];
  }

  const groups = new Map();
  for (const row of rest) {
    const key = statusKey(row.entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  // Grouped, the original belongs to no folder, so no Latest-in list.
  const rows = [{ ...original, list: null }];
  for (const key of [...groups.keys()].sort(byStatus)) {
    const groupRows = groups.get(key);
    const id = `${launchpad.ID}:${key}`;
    const open = openGroups[id] ?? groupRows.some((row) => row.entry.ID === selectedEntryId);
    rows.push({ kind: "group", id, key, count: groupRows.length, open, depth: 1 });
    if (open) {
      rows.push(...windowed(groupRows, id, 2, shown(id), `${launchpad.Name} · ${key}`, selectedEntryId));
    }
  }
  return rows;
}
