// What the frontend shows for updates (GLOSSARY "Updates"). The Go side
// decides whether a build is an update; this module turns its UpdateCheck and
// UpdateState into what the researcher sees.

/**
 * The toast a "Check for updates…" result shows, or null when the details
 * panel opens instead (an update was found).
 */
export function checkResultNotice(check) {
  switch (check?.Outcome) {
    case "available":
      return null;
    case "none":
      return {
        message: `You're on the latest ${check.Channel} build`,
        background: "variant-filled-success",
      };
    case "unavailable":
      return {
        message: "Development builds don't check for updates",
        background: "variant-filled-warning",
      };
    default:
      return {
        message: `Could not check for updates: ${check?.Reason || "unknown error"}`,
        background: "variant-filled-error",
      };
  }
}

/** The modal settings that open the update details panel. */
export function updatePanelModal() {
  return {
    type: "component",
    component: "Update",
    title: "Update",
    toggleAction: "global.check-for-updates",
  };
}

/** Whether the update indicator shows in the app chrome for state. */
export function showsUpdateIndicator(state) {
  return state?.Status === "available" && Boolean(state.Update);
}
