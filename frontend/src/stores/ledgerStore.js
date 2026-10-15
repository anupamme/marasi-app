// The app's Ledger store, bound to the Wails backend. The logic lives in
// createLedgerStore.js, which tests load with a fake API.
import {
  CreateLaunchpadEntry,
  GetFilters,
  GetMetadata,
  GetNote,
  GetProxyItems,
  GetRawDetails,
  HighlightRow,
  LinkRequestToLaunchpad,
  QueryTraffic,
  SetFilters,
} from "../lib/wailsjs/go/main/App";
import {
  createLedgerStore,
  FLUSH_INTERVAL_MS,
  isQueryActive,
  NEW_MATCHES_POLL_MS,
  select,
} from "./createLedgerStore.js";

export {
  indexWarning,
  isQueryActive,
  ledgerPagination,
  markQueryError,
  matchCountLabel,
  matchNoun,
  needsOlderPage,
  queryStatusLabel,
  select,
  shownRows,
} from "./createLedgerStore.js";

export const ledgerStore = createLedgerStore({
  getLiveView: () => GetProxyItems(),
  queryTraffic: (query, cursor) => QueryTraffic(query, cursor),
  getExclusion: () => GetFilters(),
  setExclusion: (types) => SetFilters(types),
  getRawDetails: (id) => GetRawDetails(id),
  getMetadata: (id) => GetMetadata(id),
  getNote: (id) => GetNote(id),
  highlight: (id, color) => HighlightRow(id, color),
  createLaunchpad: (name, description) => CreateLaunchpadEntry(name, description),
  linkToLaunchpad: (requestId, launchpadId) =>
    LinkRequestToLaunchpad(requestId, launchpadId),
});

/** The live view, for the pages outside the Ledger that read it. */
export const liveViewItems = select(ledgerStore, (state) => state.items);

if (typeof window !== "undefined") {
  setInterval(ledgerStore.flush, FLUSH_INTERVAL_MS);

  // Polls for new matches only while query mode is active.
  let pollTimer = null;
  select(ledgerStore, (state) => isQueryActive(state.query)).subscribe(
    (active) => {
      if (active && pollTimer === null) {
        pollTimer = setInterval(
          ledgerStore.checkForNewMatches,
          NEW_MATCHES_POLL_MS,
        );
      } else if (!active && pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
  );
}
