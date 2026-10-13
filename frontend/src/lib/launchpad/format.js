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

export function shortTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}
