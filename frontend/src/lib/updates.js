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
export const channelSettingPath = "/settings?section=updates";

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

/**
 * A nightly's notes as the details panel shows them: the commit subjects the
 * nightly workflow lists and its Ref line, without the Commit line Marasi
 * reads the nightly's commit from. A nightly published before the workflow
 * listed subjects has only Ref and Commit lines, so it has nothing to show
 * ("") and the panel shows the compare link alone.
 */
export function nightlyNotes(notes) {
  const lines = (notes ?? "").split(/\r?\n/).filter((line) => !line.trim().startsWith("Commit:"));
  if (lines.every((line) => !line.trim() || line.trim().startsWith("Ref:"))) {
    return "";
  }
  return lines.join("\n").trim();
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
    case "downloading": {
      const step = installingStepLabel(state.Progress);
      if (step) {
        return `${step} update ${version}…`;
      }
      const percent = progressPercent(state.Progress);
      return percent === null ? `Downloading update ${version}` : `Downloading update ${version} · ${percent}%`;
    }
    case "failed":
      return `Update ${version} failed to install`;
    case "restart-pending":
      return `Restart Marasi to run ${version}`;
    default:
      return `Update available: ${version}`;
  }
}

/**
 * What the Settings icon carries for state (variant B of the update UI), or
 * null when no update is known:
 * - { kind: "ring", percent, spinning }: a ring around the icon filling with
 *   the download, full and spinning while verifying and installing;
 * - { kind: "dot", tone, pulse }: a dot, "error" after a failed install,
 *   pulsing while a restart is waiting.
 */
export function settingsIconIndicator(state) {
  if (!showsUpdateIndicator(state)) {
    return null;
  }
  if (state.Status === "downloading") {
    if (installingStepLabel(state.Progress)) {
      return { kind: "ring", percent: 100, spinning: true };
    }
    return { kind: "ring", percent: progressPercent(state.Progress) ?? 0, spinning: false };
  }
  return {
    kind: "dot",
    tone: state.Status === "failed" ? "error" : "primary",
    pulse: state.Status === "restart-pending",
  };
}

/** Where the Settings icon goes: Settings → Updates while an update is waiting. */
export function settingsPath(state) {
  return showsUpdateIndicator(state) ? channelSettingPath : "/settings";
}

/** "Verifying" or "Installing" for an install past its download, else null. */
function installingStepLabel(progress) {
  switch (progress?.Step) {
    case "verify":
      return "Verifying";
    case "install":
      return "Installing";
    default:
      return null;
  }
}

/** How much of the build has downloaded, in whole percent, or null when its size is unknown. */
export function progressPercent(progress) {
  if (!progress?.Total) {
    return null;
  }
  return Math.floor((progress.Received * 100) / progress.Total);
}

const megabyte = 1024 * 1024;

/** How much of the build has downloaded, in megabytes, of its size when known. */
export function downloadedAmount(progress) {
  const received = ((progress?.Received ?? 0) / megabyte).toFixed(1);
  if (!progress?.Total) {
    return `${received} MB`;
  }
  return `${received} of ${(progress.Total / megabyte).toFixed(1)} MB`;
}

/** Whether Cancel can stop the running install: only while it downloads. */
export function cancellable(progress) {
  return !progress?.Step || progress.Step === "download";
}

const failureTitles = {
  network: "Download failed",
  signature: "Signature check failed",
  checksum: "Checksum check failed",
  team: "Developer team check failed",
  permissions: "Marasi cannot replace itself",
  install: "Install failed",
};

const noBuildMessage = "This release has no build for your platform";

/** A failed install's title (an UpdateFailure), without its reason. */
function installFailureTitle(failure) {
  if (failure?.Kind === "no-build") {
    return noBuildMessage;
  }
  return failureTitles[failure?.Kind] ?? "Install failed";
}

/** What the panel says about a failed install (an UpdateFailure). */
export function installFailureMessage(failure) {
  if (failure?.Kind === "no-build") {
    return noBuildMessage;
  }
  return `${installFailureTitle(failure)}: ${failure?.Reason || "unknown error"}`;
}

// The update panel's steps: each step's id, its label, and its label while it runs.
const panelSteps = [
  ["details", "Details", "Details"],
  ["download", "Download", "Downloading"],
  ["verify", "Verify", "Verifying"],
  ["install", "Install", "Installing"],
  ["restart", "Restart", "Restart"],
];

/**
 * The update panel's steps for state: the step it is on (current), whether
 * the install failed there, and each step's mark: done (ticked), current
 * (outlined, with its -ing label), failed (red, with its plain label), todo
 * (dimmed) or skipped (passed over without running).
 */
export function updatePanelSteps(state) {
  let current = "details";
  let failed = false;
  if (cannotReplaceItself(state)) {
    current = "install";
    failed = true;
  } else if (state?.Status === "downloading") {
    current = state.Progress?.Step || "download";
  } else if (state?.Status === "restart-pending") {
    current = "restart";
  } else if (state?.Status === "failed") {
    current = state.Failure?.Step || "install";
    failed = true;
  }
  // A Marasi that can't replace itself is found out before anything
  // downloads: the steps before Install never ran.
  const skipsToInstall = failed && cannotReplaceItself(state);
  const index = panelSteps.findIndex(([id]) => id === current);
  return {
    current,
    failed,
    steps: panelSteps.map(([id, label, runningLabel], i) => {
      let mark = "todo";
      if (i === index) {
        mark = failed ? "failed" : "current";
      } else if (i < index) {
        mark = skipsToInstall && i > 0 ? "skipped" : "done";
      }
      return { id, label: mark === "current" ? runningLabel : label, mark };
    }),
  };
}

/**
 * The update panel's error box for state, or null when nothing failed:
 * what failed (message), and whether Try again could help (retry). It
 * cannot where Marasi can't replace itself or the release has no build for
 * this platform.
 */
export function updatePanelFailure(state) {
  if (state?.Status === "available" && state.CanInstall === false) {
    return { message: state.CannotInstallReason || "Marasi cannot replace itself", retry: false };
  }
  if (state?.Status !== "failed") {
    return null;
  }
  const failure = state.Failure;
  if (failure?.Kind === "permissions") {
    return { message: failure.Reason || "Marasi cannot replace itself", retry: false };
  }
  return { message: installFailureMessage(failure), retry: failure?.Kind !== "no-build" };
}

/**
 * Whether the update cannot be installed because Marasi cannot replace
 * itself: found before Install is offered (CanInstall), or when the install
 * started (a permissions failure).
 */
function cannotReplaceItself(state) {
  if (state?.Status === "available") {
    return state.CanInstall === false;
  }
  return state?.Status === "failed" && state.Failure?.Kind === "permissions";
}

/** The status row of Settings → Updates: where the researcher stands for state. */
export function updateStatusLine(state) {
  if (state?.Status === "unavailable") {
    return "Development builds don't check for updates";
  }
  if (!showsUpdateIndicator(state)) {
    return "Up to date";
  }
  const version = state.Update.Version;
  switch (state.Status) {
    case "downloading": {
      const step = installingStepLabel(state.Progress);
      return step ? `${step} ${version}…` : `Downloading ${version} · ${progressPercent(state.Progress) ?? 0}%`;
    }
    case "restart-pending":
      return `${version} ready to restart`;
    case "failed":
      return installFailureTitle(state.Failure);
    default:
      return `${version} available`;
  }
}

/**
 * The state after a check found update (the update-available event, or a
 * "Check for updates…" result). An update downloading or waiting for a
 * restart stays: it is what the researcher chose to install.
 */
export function withUpdateFound(state, update) {
  if (state?.Status === "downloading" || state?.Status === "restart-pending") {
    return state;
  }
  return { ...state, Status: "available", Update: update, Progress: null, Failure: null };
}

/**
 * The state after "Check for updates…" returns its UpdateCheck. Like Go, a
 * check that finds nothing forgets the known update (so the panel closes),
 * unless it is downloading or waiting for a restart; a failed check changes
 * nothing.
 */
export function withCheckResult(state, check) {
  switch (check?.Outcome) {
    case "available":
      return withUpdateFound(state, check.Update);
    case "none":
      if (state?.Status === "downloading" || state?.Status === "restart-pending") {
        return state;
      }
      return { ...state, Status: "idle", Update: null, Progress: null, Failure: null };
    default:
      return state;
  }
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
