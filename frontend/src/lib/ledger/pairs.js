// Pair IDs as the Ledger compares them, and limits on per-pair actions,
// shared by the Ledger store, the table and the row menu.

/** The most pairs "one launchpad each" sends at a time. */
export const LAUNCHPADS_EACH_MAX = 25;

/** True when both are pair IDs and they name the same pair. */
export function sameID(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/** The IDs of `items`, as strings. */
export function pairIDSet(items) {
  return new Set(items.map((item) => String(item.ID)));
}
