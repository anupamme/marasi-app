// Display helpers for the Launchpad page.

/** Marasi's primary variant: ghost in light mode, filled in dark. */
export const primaryVariant = (lightMode) =>
  lightMode ? "variant-ghost-primary ring-0 shadow-none" : "variant-filled-primary";

/** Text colour class for an HTTP status code; pending (0) is dimmed. */
export function statusClass(code) {
  if (!code) return "opacity-50";
  if (code < 300) return "text-success-500";
  if (code < 400) return "text-warning-500";
  return "text-error-500";
}

/**
 * How a launch that did not complete ended, for the tree and the response
 * pane: "Cancelled", "Failed: upstream_error", or null when it is pending,
 * completed, or not a launch.
 */
export function launchEndText(launch) {
  if (launch?.Status === "cancelled") return "Cancelled";
  if (launch?.Status === "failed") return launch.Reason ? `Failed: ${launch.Reason}` : "Failed";
  return null;
}

export function shortTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}
