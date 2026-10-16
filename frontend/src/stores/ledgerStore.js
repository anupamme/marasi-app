// The app's Ledger store, bound to the Wails backend. The logic lives in
// createLedgerStore.js, which tests load with a fake API.
import {
  CountContentTypes,
  CountTraffic,
  CreateLaunchpadEntry,
  DeleteClientSetting,
  GetClientSetting,
  GetContentTypeExclusion,
  GetDefaultContentTypeExclusion,
  GetMetadata,
  GetNote,
  GetRawDetails,
  HighlightRow,
  LinkRequestToLaunchpad,
  ListClientSettings,
  QueryTraffic,
  ResetContentTypeExclusion,
  SetClientSetting,
  SetContentTypeExclusion,
  SetDefaultContentTypeExclusion,
} from "../lib/wailsjs/go/main/App";
import { createLedgerStore, FLUSH_INTERVAL_MS } from "./createLedgerStore.js";

export {
  clampDrawerSplit,
  countLabel,
  drawerKeybindingState,
  focusedPair,
  hiddenByTypeCount,
  indexWarning,
  isDrawerOpen,
  isQueryActive,
  markQueryError,
  matchNoun,
  newMatchesKind,
  newMatchesLabel,
  select,
  shownRows,
  tableRows,
} from "./createLedgerStore.js";

export const ledgerStore = createLedgerStore({
  // A page of the live view or of a query's results:
  // { Query, OrderBy, Cursor, Direction, AsOf, Limit }.
  queryTraffic: (request) => QueryTraffic(request),
  // after: "" counts every match, else only pairs captured after that id.
  // options: { AsOf, IgnoreExclusion }; AsOf counts only pairs up to it.
  countTraffic: (query, after, options = {}) => CountTraffic(query, after, options),
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
  highlight: (id, color) => HighlightRow(id, color),
  createLaunchpad: (name, description) => CreateLaunchpadEntry(name, description),
  linkToLaunchpad: (requestId, launchpadId) =>
    LinkRequestToLaunchpad(requestId, launchpadId),
  // Not called by the store yet; the Ledger's client settings use them.
  getClientSetting: (key) => GetClientSetting(key),
  setClientSetting: (key, value) => SetClientSetting(key, value),
  deleteClientSetting: (key) => DeleteClientSetting(key),
  listClientSettings: (prefix) => ListClientSettings(prefix),
});

if (typeof window !== "undefined") {
  setInterval(ledgerStore.flush, FLUSH_INTERVAL_MS);
}
