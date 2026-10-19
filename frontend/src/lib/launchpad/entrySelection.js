// The Entry selection: the launchpad entries a researcher has picked in one
// launchpad, separate from the Ledger's selection. Every function here is
// pure and returns a new selection: { launchpadId, ids, anchor }, where
// `anchor` is where ⇧-click ranges start and what Esc collapses to.

/** No entry selected. */
export const NO_ENTRY_SELECTION = Object.freeze({ launchpadId: null, ids: [], anchor: null });

/** Just this entry, anchored on it. */
export function selectOnly(launchpadId, entryId) {
  return { launchpadId, ids: [entryId], anchor: entryId };
}

// The selected ids when the selection is in this launchpad; none otherwise,
// so a selection never spans two launchpads.
const idsIn = (selection, launchpadId) =>
  selection.launchpadId === launchpadId ? selection.ids : [];

/** ⌘-click: adds or removes the entry, which becomes the anchor. */
export function toggle(selection, launchpadId, entryId) {
  const ids = idsIn(selection, launchpadId);
  return {
    launchpadId,
    ids: ids.includes(entryId) ? ids.filter((id) => id !== entryId) : [...ids, entryId],
    anchor: entryId,
  };
}

/**
 * ⇧-click: the entries from the anchor to this one in `order` (entry ids as
 * the tree lists them), replacing the selection; the anchor stays. Without
 * an anchor in `order`, selects just this entry.
 */
export function extend(selection, launchpadId, entryId, order) {
  const from = selection.launchpadId === launchpadId ? order.indexOf(selection.anchor) : -1;
  const to = order.indexOf(entryId);
  if (from < 0 || to < 0) return selectOnly(launchpadId, entryId);
  return {
    launchpadId,
    ids: order.slice(Math.min(from, to), Math.max(from, to) + 1),
    anchor: selection.anchor,
  };
}

/**
 * ⌘A: every entry in `order` (the launchpad's entry ids). The anchor stays
 * when it is one of them, else moves to the first.
 */
export function selectAll(selection, launchpadId, order) {
  if (order.length === 0) return selection;
  const kept = selection.launchpadId === launchpadId && order.includes(selection.anchor);
  return { launchpadId, ids: [...order], anchor: kept ? selection.anchor : order[0] };
}

/**
 * Esc: just the anchor, or the last selected entry when the anchor was
 * unselected by its ⌘-click.
 */
export function collapse(selection) {
  const { launchpadId, ids, anchor } = selection;
  const keep = ids.includes(anchor) ? anchor : ids.at(-1);
  return keep ? selectOnly(launchpadId, keep) : selection;
}
