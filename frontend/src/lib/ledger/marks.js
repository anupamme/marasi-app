// The Marks menu's rows: pairs the researcher has annotated or linked. Each
// row toggles its query term. Intercepted is left out: the pinned marasi has
// no query field for intercepted pairs.
import { hasQueryTerm } from "../ledgerQueryFields.js";

export const MARKS = [
  { id: "note", label: "Has note", term: "note:*" },
  { id: "finding", label: "In a finding", term: "finding:*" },
  { id: "test-case", label: "In a test case", term: "test_case:*" },
  { id: "launchpad", label: "In a launchpad", term: "launchpad:*" },
];

/** How many mark terms the query has as conditions of their own. */
export function activeMarkCount(text) {
  return MARKS.filter((mark) => hasQueryTerm(text, mark.term)).length;
}

/**
 * A menu row's match count: "…" while loading (undefined), "–" when it
 * couldn't be counted (null), "100,000+" past marasi's cap.
 */
export function matchCountText(count) {
  if (count === undefined) return "…";
  if (count === null) return "–";
  return count.count.toLocaleString("en-US") + (count.capped ? "+" : "");
}
