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

/** Where the details panel's link to the Channel setting goes. */
export const channelSettingPath = "/settings?section=about";

/**
 * The toast after the Channel setting changes (a ChannelChange), or null when
 * the check a switch to nightly runs found an update and the panel opens
 * instead. A nightly switched to release keeps running (ADR 0006), so the
 * toast says so and points to the reinstall.
 */
export function channelSwitchNotice(change, running) {
  if (change?.Check) {
    return checkResultNotice(change.Check);
  }
  const channel = change?.Settings?.Channel ?? "";
  if (channel === "release" && running?.Channel === "nightly") {
    return {
      message:
        "Switched to release. You keep this nightly until a newer release is published; Reinstall latest release goes back now.",
      background: "variant-filled-success",
    };
  }
  return { message: `Switched to ${channel}`, background: "variant-filled-success" };
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

// Statuses in which an update is known, from found until the restart.
const updateStatuses = new Set(["available", "downloading", "failed", "restart-pending"]);

/** Whether the update indicator shows in the app chrome for state. */
export function showsUpdateIndicator(state) {
  return updateStatuses.has(state?.Status) && Boolean(state.Update);
}

/** The indicator's tooltip and label for state. */
export function updateIndicatorLabel(state) {
  const version = state?.Update?.Version ?? "";
  switch (state?.Status) {
    case "downloading":
      return `Downloading update ${version}`;
    case "failed":
      return `Update ${version} failed to install`;
    case "restart-pending":
      return `Restart Marasi to run ${version}`;
    default:
      return `Update available: ${version}`;
  }
}

/** How much of the build has downloaded, in whole percent, or null when its size is unknown. */
export function progressPercent(progress) {
  if (!progress?.Total) {
    return null;
  }
  return Math.floor((progress.Received * 100) / progress.Total);
}

const failureTitles = {
  network: "Download failed",
  signature: "Signature check failed",
  checksum: "Checksum check failed",
  permissions: "Marasi cannot replace itself",
  install: "Install failed",
};

/** What the panel says about a failed install (an UpdateFailure). */
export function installFailureMessage(failure) {
  const title = failureTitles[failure?.Kind] ?? "Install failed";
  return `${title}: ${failure?.Reason || "unknown error"}`;
}

/** The state once the researcher chose Install, before any progress. */
export function withInstallStarted(state) {
  return { ...state, Status: "downloading", Progress: null, Failure: null };
}

/** The state after an update-progress event; ignored unless downloading. */
export function withProgress(state, progress) {
  if (state?.Status !== "downloading") {
    return state;
  }
  return { ...state, Progress: progress };
}

/** The state after an update-installed event: installed, waiting for a restart. */
export function withInstalled(state, update) {
  return { ...state, Status: "restart-pending", Update: update, Progress: null, Failure: null };
}

/** The state after an update-failed event. */
export function withFailure(state, failure) {
  return { ...state, Status: "failed", Progress: null, Failure: failure };
}

/** The state once InstallUpdate returns its UpdateInstall result. */
export function withInstallResult(state, result) {
  switch (result?.Outcome) {
    case "installed":
      return withInstalled(state, result.Update ?? state.Update);
    case "failed":
      return withFailure(state, result.Failure);
    default:
      return { ...state, Status: "available", Progress: null };
  }
}
