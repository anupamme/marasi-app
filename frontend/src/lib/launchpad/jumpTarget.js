// The floating "Latest in …" button of the Launchpad tree, like the
// WebSocket table's "Jump to bottom". Pure, so it takes measured geometry.

/** Height of the sticky launchpad row that covers the top of the tree. */
export const STICKY_HEADER = 34;
/** Sub-pixel tolerance when deciding the last entry is fully visible. */
const FOLD_SLACK = 1;

/**
 * The list (a launchpad, or one status folder) whose button to show, or null.
 * `rows` are the tree's entry rows in document order, each
 * `{ list, label, top, bottom, last }` in viewport pixels; `view` is the
 * scroll container's `{ top, bottom }`. The target is the list at the top of
 * the viewport, while that list's last entry is not fully visible.
 */
export function jumpTarget(rows, view) {
  const top = rows.find((row) => row.list && row.bottom > view.top + STICKY_HEADER);
  if (!top) return null;
  const last = rows.find((row) => row.list === top.list && row.last);
  if (!last || last.bottom <= view.bottom + FOLD_SLACK) return null;
  return { list: top.list, label: last.label };
}
