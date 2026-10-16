// The app's sitemap store, bound to the Wails backend and following the
// Ledger store. The logic lives in createSitemapStore.js, which tests load
// with a fake API.
import { ListSitemapChildren } from "../lib/wailsjs/go/main/App";
import { createSitemapStore } from "./createSitemapStore.js";
import { FLUSH_INTERVAL_MS } from "./createLedgerStore.js";
import { ledgerStore } from "./ledgerStore";

export { hostCountLabel, sitemapRows, sitemapScope, STEP, WINDOW } from "./createSitemapStore.js";

export const sitemapStore = createSitemapStore({
  // { Node, Cursor, Limit, Query, AsOf, Matching } →
  // { Children, NextCursor, Complete, Missing, QueryError }.
  listSitemapChildren: (request) => ListSitemapChildren(request),
});

// The running query, its results' as_of and the exclusion. The sitemap
// waits for the ledger's first rows, so it never delays them.
ledgerStore.subscribe((state) =>
  sitemapStore.setContext({
    query: state.query.ranQuery,
    asOf: state.results.asOf,
    exclusion: state.exclusion,
    ready: !state.results.loading,
  }),
);

if (typeof window !== "undefined") {
  setInterval(sitemapStore.flush, FLUSH_INTERVAL_MS);
}
