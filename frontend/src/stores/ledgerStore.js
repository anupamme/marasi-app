// The app's Ledger store, bound to the Wails backend. The logic lives in
// createLedgerStore.js, which tests load with a fake API.
import {
  ClearHighlight,
  CountContentTypes,
  CountTraffic,
  CreateLaunchpadEntry,
  DeleteClientSetting,
  GetClientSetting,
  GetContentTypeExclusion,
  GetDefaultContentTypeExclusion,
  GetMetadata,
  GetNote,
  GetProxyItems,
  GetRawDetails,
  LinkRequestToLaunchpad,
  ListClientSettings,
  QueryTraffic,
  ResetContentTypeExclusion,
  SetClientSetting,
  SetContentTypeExclusion,
  SetDefaultContentTypeExclusion,
  SetHighlight,
} from "../lib/wailsjs/go/main/App";
import { armoryStore } from "./armoryStore";
import { findingStore } from "./findingStore";
import { testCaseStore } from "./testCaseStore";
import {
  createLedgerStore,
  FLUSH_INTERVAL_MS,
  isQueryActive,
  NEW_MATCHES_POLL_MS,
  select,
} from "./createLedgerStore.js";

export {
  canLoadOlder,
  clampDrawerSplit,
  drawerKeybindingState,
  focusedPair,
  hiddenByTypeCount,
  indexWarning,
  isDrawerOpen,
  isSelected,
  LAUNCHPADS_EACH_MAX,
  selectedPairs,
  isQueryActive,
  tableRows,
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
  // after: "" counts every match, else only pairs captured after that id.
  countTraffic: (query, after) => CountTraffic(query, after),
  getExclusion: () => GetContentTypeExclusion(),
  setExclusion: (types) => SetContentTypeExclusion(types),
  // ledger.exclusion is the project's own list; without it the project
  // follows the app default.
  hasOwnExclusion: async () => (await GetClientSetting("ledger.exclusion")) != null,
  resetExclusion: () => ResetContentTypeExclusion(),
  getDefaultExclusion: () => GetDefaultContentTypeExclusion(),
  setDefaultExclusion: (types) => SetDefaultContentTypeExclusion(types),
  countContentTypes: () => CountContentTypes(),
  getRawDetails: (id) => GetRawDetails(id),
  getMetadata: (id) => GetMetadata(id),
  getNote: (id) => GetNote(id),
  // selection is { ids }; each resolves to how many pairs changed.
  setHighlight: (selection, highlight) => SetHighlight(selection, highlight),
  clearHighlight: (selection) => ClearHighlight(selection),
  createLaunchpad: (name, description) => CreateLaunchpadEntry(name, description),
  linkToLaunchpad: (requestId, launchpadId) =>
    LinkRequestToLaunchpad(requestId, launchpadId),
  // Findings, test cases and Armory templates go through their stores, so
  // the lists they hold stay current.
  linkToFinding: (requestId, findingId) => findingStore.linkRequest(findingId, requestId),
  unlinkFromFinding: (requestId, findingId) =>
    findingStore.unlinkRequest(findingId, requestId),
  linkToTestCase: (requestId, testCaseId) => testCaseStore.linkRequest(testCaseId, requestId),
  unlinkFromTestCase: (requestId, testCaseId) =>
    testCaseStore.unlinkRequest(testCaseId, requestId),
  createFinding: (requestIds) => findingStore.create(requestIds),
  createTestCase: (requestIds) => testCaseStore.create(requestIds),
  sendToArmory: (requestId) => armoryStore.createTemplateFromRequest(requestId),
  // Not called by the store yet; the Ledger's client settings use them.
  getClientSetting: (key) => GetClientSetting(key),
  setClientSetting: (key, value) => SetClientSetting(key, value),
  deleteClientSetting: (key) => DeleteClientSetting(key),
  listClientSettings: (prefix) => ListClientSettings(prefix),
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
