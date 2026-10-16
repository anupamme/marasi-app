// How the Ledger writes counts: "1 request", "1,200 requests", "100,000+",
// "match" or "matches". Numbers use the reader's locale, as the rest of the
// app does.

/** `n` with "+" when Marasi capped the count, so more matched. */
export function formatCount(n, capped = false) {
  return `${n.toLocaleString()}${capped ? "+" : ""}`;
}

/** "1 request", "3 requests"; `many` for irregular plurals. */
export function plural(n, one, many = one + "s") {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "1 request", "3 requests". */
export function requestCount(n) {
  return plural(n, "request");
}

/** "match" or "matches" for `count`; `more` means there could be more. */
export function matchNoun(count, more = false) {
  return count === 1 && !more ? "match" : "matches";
}

/**
 * A menu row's match count, { count, capped }: "…" while loading
 * (undefined), "–" when it couldn't be counted (null), "!" for a query
 * Marasi rejects ({ error }), "100,000+" past Marasi's cap.
 */
export function matchCountText(count) {
  if (count === undefined) return "…";
  if (count === null) return "–";
  if (count.error) return "!";
  return formatCount(count.count, count.capped);
}
