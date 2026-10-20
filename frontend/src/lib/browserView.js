// Marasi's own pages: the proxy listener answers requests to the host
// `marasi` itself, so they open only in a browser that uses the proxy.
// Plain functions, so they load under node.

/** Where a proxied browser downloads Marasi's CA certificate. */
export const CERT_URL = "http://marasi/cert";

/**
 * The browser view URL of the pair with UUID `id`. Opening it redirects to
 * the pair's original URL, where the browser gets the stored response
 * without contacting the origin (marasi ADR-0055).
 */
export const browserViewURL = (id) => `http://marasi/view/${id}`;

/**
 * Why the pair (a Ledger row or launchpad entry, with a flat StatusCode)
 * has no browser view, or null when it has one. Marasi answers 409 for
 * these.
 */
export function browserViewRefusal(pair) {
  const status = Number(pair?.StatusCode) || 0;
  if (status <= 0) return "No response yet";
  if (status === 101) return "Not for a WebSocket upgrade";
  return null;
}

/** The toast after copying a browser view URL. */
export const BROWSER_VIEW_COPIED = "Copied the browser view URL. Open it in a browser that uses Marasi's proxy";
