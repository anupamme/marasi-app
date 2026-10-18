// Compare-mode rules for the Launchpad page, as pure functions of the
// launchpad store state. The store holds `compare` as
// { launchpadId, leftId (A), rightId (B), picking: "left" | "right" | null }.

/** The compare sides: each side's id key in `compare`, its label, and the other side. */
export const COMPARE_SIDES = {
  left: { key: "leftId", label: "A", other: "right" },
  right: { key: "rightId", label: "B", other: "left" },
};

/** The side ("left" or "right") the entry fills in the comparison, or null. */
export function compareSideOf(compare, entryId) {
  if (!compare) return null;
  if (compare.leftId === entryId) return "left";
  if (compare.rightId === entryId) return "right";
  return null;
}

/**
 * What an entry click does while comparing: "left" or "right" to fill that
 * side, "ignore" for the entry already on the other side, or null to select
 * the entry as usual.
 */
export function compareClick(state, launchpadId, entryId) {
  const compare = state.compare;
  if (!compare || compare.launchpadId !== launchpadId) return null;
  const side = compare.picking ?? "right";
  const otherId = compare[COMPARE_SIDES[COMPARE_SIDES[side].other].key];
  return entryId === otherId ? "ignore" : side;
}

/**
 * What Esc does: "stop-picking" cancels a chip re-pick while the diff shows,
 * "close" ends compare (including while still picking B), null otherwise.
 */
export function compareEscape(state) {
  const compare = state.compare;
  if (!compare) return null;
  return compare.picking && compare.leftId && compare.rightId ? "stop-picking" : "close";
}

/**
 * The open launchpad's compare, ready to render: A and B as { entry,
 * number } (number is its 1-based place in entry order), whether the diff can
 * show, and the quick picks for B. Null when the open launchpad is not
 * being compared.
 */
export function compareView(state) {
  const compare = state.compare;
  if (!compare || compare.launchpadId !== state.selectedLaunchpadId) return null;
  const entries = state.entriesByLaunchpad[compare.launchpadId] || [];
  const side = (id) => {
    const index = id ? entries.findIndex((entry) => entry.ID === id) : -1;
    return index < 0 ? null : { entry: entries[index], number: index + 1 };
  };
  const left = side(compare.leftId);
  const right = side(compare.rightId);
  const quickPicks = [];
  if (left) {
    const at = left.number - 1;
    if (at > 0) quickPicks.push({ label: `Previous (#${at})`, id: entries[at - 1].ID });
    if (at < entries.length - 1) quickPicks.push({ label: `Next (#${at + 2})`, id: entries[at + 1].ID });
    if (at > 1) quickPicks.push({ label: "Original (#1)", id: entries[0].ID });
  }
  return {
    picking: compare.picking,
    left,
    right,
    comparing: !!(left && right),
    quickPicks,
  };
}

function lengthOf(details, tab) {
  if (tab === "request") return details?.Request ? (details.Request.Raw ?? "").length : null;
  const response = details?.Response;
  if (!response) return null;
  // Go sends Length as a string; fall back to the raw text when it is unset.
  const length = Number.parseInt(response.Length, 10);
  return Number.isNaN(length) ? (response.Raw ?? "").length : length;
}

/** A → B lengths for the compare tab, and B minus A; null while unknown. */
export function lengthSummary(leftDetails, rightDetails, tab) {
  const left = lengthOf(leftDetails, tab);
  const right = lengthOf(rightDetails, tab);
  return { left, right, delta: left === null || right === null ? null : right - left };
}

// Lines in [from, to) of `text`. A range ending at the last line runs one
// past the end of the text, as MergeView chunks do.
function linesIn(text, from, to) {
  if (from >= to) return 0;
  const breaks = text.slice(from, Math.min(to, text.length)).split("\n").length - 1;
  return breaks + (to > text.length ? 1 : 0);
}

/**
 * Changed lines in a MergeView diff of `a` and `b`: each chunk counts its
 * longer side, so an edited line counts once.
 */
export function changedLineCount(chunks, a = "", b = "") {
  return chunks.reduce(
    (sum, chunk) => sum + Math.max(linesIn(a, chunk.fromA, chunk.toA), linesIn(b, chunk.fromB, chunk.toB)),
    0,
  );
}
