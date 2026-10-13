// Which launchpads and status folders the tree shows open. Pure: the tree
// keeps `expanded` (launchpad ID → bool) and `openGroups` (status folder ID →
// bool, as read by treeRows.entryRows) and swaps in what these return.
import { statusKey } from "./treeRows.js";

// IDs of every status folder; the original (first) entry is in none.
function statusFolderIds(launchpads, entriesByLaunchpad) {
  const ids = new Set();
  for (const launchpad of launchpads) {
    for (const entry of (entriesByLaunchpad[launchpad.ID] || []).slice(1)) {
      ids.add(`${launchpad.ID}:${statusKey(entry)}`);
    }
  }
  return [...ids];
}

const allSet = (ids, value) => Object.fromEntries(ids.map((id) => [id, value]));

/**
 * Every launchpad open, plus every status folder when `groupByStatus`;
 * otherwise `openGroups` is kept as is.
 */
export function expandAll({ launchpads, entriesByLaunchpad, groupByStatus, openGroups = {} }) {
  return {
    expanded: allSet(launchpads.map((launchpad) => launchpad.ID), true),
    openGroups: groupByStatus ? allSet(statusFolderIds(launchpads, entriesByLaunchpad), true) : openGroups,
  };
}

/**
 * Every launchpad and status folder closed. Explicit `false`s, so neither
 * autoExpand nor a folder holding the selected entry reopens them.
 */
export function collapseAll({ launchpads, entriesByLaunchpad }) {
  return {
    expanded: allSet(launchpads.map((launchpad) => launchpad.ID), false),
    openGroups: allSet(statusFolderIds(launchpads, entriesByLaunchpad), false),
  };
}

/**
 * Opens `selectedId` the first time it is selected; once the user (or
 * collapseAll) has chosen open or closed, that choice stands.
 */
export function autoExpand(expanded, selectedId) {
  if (!selectedId || expanded[selectedId] !== undefined) return expanded;
  return { ...expanded, [selectedId]: true };
}
