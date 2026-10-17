// The request pickers in the finding and test case modals search the
// project's traffic through QueryTraffic instead of holding every pair.
import { writable } from "svelte/store";

/** How many pairs a picker offers at once. */
export const PICKER_LIMIT = 100;

/** How long typing must pause before a picker searches. */
export const PICKER_DELAY_MS = 200;

/**
 * A picker's options as the researcher types: a store of the options for
 * the latest text. `search(text)` searches once typing pauses for
 * PICKER_DELAY_MS, through `searchText(text)` (resolving to options); an
 * older search that lands late is dropped, and blank text offers nothing.
 * `cancel()` drops a search still waiting.
 */
export function createRequestPicker(searchText) {
  const options = writable([]);
  let timer = null;
  let latest = 0;
  function cancel() {
    clearTimeout(timer);
    latest++;
  }
  function search(text) {
    cancel();
    if (!String(text ?? "").trim()) {
      options.set([]);
      return;
    }
    const run = latest;
    timer = setTimeout(async () => {
      const found = await searchText(text);
      if (run === latest) options.set(found);
    }, PICKER_DELAY_MS);
  }
  return { subscribe: options.subscribe, search, cancel };
}

/**
 * The traffic query for the picker's text: the text anywhere in the host or
 * the path, and a whole number also the pair with that pair number ("#10"
 * only that pair). Quotes and backslashes are dropped so the text stays one
 * value. "" lists every pair.
 */
export function requestPickerQuery(text) {
  const value = (text ?? "").trim().replace(/["\\]/g, "");
  if (!value) return "";
  const numbered = /^#\d+$/.test(value);
  if (numbered) return `number = ${Number(value.slice(1))}`;
  const anywhere = `host = "*${value}*" OR path = "*${value}*"`;
  return /^\d+$/.test(value) ? `number = ${Number(value)} OR ${anywhere}` : anywhere;
}

/** A pair as a picker option: { label, value, ...pair }. */
export function requestOption(pair) {
  const label = `${pair.Number ? `#${pair.Number} ` : ""}${pair.Method} ${pair.Scheme}://${pair.Host}${pair.Path}`;
  return { label, value: pair.ID, ...pair };
}

/**
 * The newest pairs of any content type that match the picker's text, as
 * options. `queryTraffic` is the QueryTraffic binding.
 */
export async function searchRequests(queryTraffic, text) {
  try {
    const page = await queryTraffic({
      Query: requestPickerQuery(text),
      OrderBy: "number desc",
      Limit: PICKER_LIMIT,
      IgnoreExclusion: true,
    });
    if (page.QueryError) return [];
    return (page.Items ?? []).map(requestOption);
  } catch (err) {
    console.error("Searching requests failed:", err);
    return [];
  }
}
