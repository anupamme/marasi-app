import { test } from "node:test";
import assert from "node:assert/strict";
import {
  channelSettingPath,
  channelSwitchNotice,
  cancellable,
  checkResultNotice,
  installFailureMessage,
  installProgressLabel,
  progressPercent,
  showsUpdateIndicator,
  updateIndicatorLabel,
  withFailure,
  withInstallResult,
  withInstallStarted,
  withInstalled,
  withProgress,
  withUpdateFound,
} from "./updates.js";

const running = { Channel: "release", Version: "16.10.2026" };

test("a check that finds nothing says the researcher is on the latest build of their channel", () => {
  assert.deepEqual(checkResultNotice({ Outcome: "none", Channel: "release", Running: running }), {
    message: "You're on the latest release build",
    background: "variant-filled-success",
  });
  assert.equal(
    checkResultNotice({ Outcome: "none", Channel: "nightly", Running: running }).message,
    "You're on the latest nightly build",
  );
});

test("a failed check states the reason", () => {
  assert.deepEqual(
    checkResultNotice({ Outcome: "failed", Channel: "release", Reason: "could not reach GitHub: no such host" }),
    {
      message: "Could not check for updates: could not reach GitHub: no such host",
      background: "variant-filled-error",
    },
  );
});

test("a development build says it does not check for updates", () => {
  assert.deepEqual(checkResultNotice({ Outcome: "unavailable", Channel: "" }), {
    message: "Development builds don't check for updates",
    background: "variant-filled-warning",
  });
});

test("a check that finds an update has no notice, because the details panel opens instead", () => {
  assert.equal(checkResultNotice({ Outcome: "available", Update: { Version: "17.10.2026" } }), null);
});

test("the indicator shows from an available update until the restart", () => {
  const update = { Version: "17.10.2026" };
  for (const Status of ["available", "downloading", "failed", "restart-pending"]) {
    assert.equal(showsUpdateIndicator({ Status, Update: update }), true, Status);
  }
  assert.equal(showsUpdateIndicator({ Status: "idle" }), false);
  assert.equal(showsUpdateIndicator({ Status: "unavailable" }), false);
  assert.equal(showsUpdateIndicator(null), false);
});

test("the indicator says when a restart is pending", () => {
  const update = { Version: "17.10.2026" };
  assert.equal(updateIndicatorLabel({ Status: "available", Update: update }), "Update available: 17.10.2026");
  assert.equal(updateIndicatorLabel({ Status: "downloading", Update: update }), "Downloading update 17.10.2026");
  assert.equal(updateIndicatorLabel({ Status: "failed", Update: update }), "Update 17.10.2026 failed to install");
  assert.equal(
    updateIndicatorLabel({ Status: "restart-pending", Update: update }),
    "Restart Marasi to run 17.10.2026",
  );
});

test("download progress is a whole percentage, or unknown without a size", () => {
  assert.equal(progressPercent({ Received: 0, Total: 200 }), 0);
  assert.equal(progressPercent({ Received: 101, Total: 200 }), 50);
  assert.equal(progressPercent({ Received: 200, Total: 200 }), 100);
  assert.equal(progressPercent({ Received: 5, Total: 0 }), null);
  assert.equal(progressPercent(null), null);
});

test("the progress line names the step the install is on", () => {
  assert.equal(installProgressLabel({ Step: "download", Received: 101, Total: 200 }), "Downloading… 50%");
  assert.equal(installProgressLabel({ Step: "download", Received: 5, Total: 0 }), "Downloading…");
  assert.equal(installProgressLabel({ Step: "verify", Received: 200, Total: 200 }), "Verifying…");
  assert.equal(installProgressLabel({ Step: "install", Received: 200, Total: 200 }), "Installing…");
  // Install chosen, before Go reports the first step.
  assert.equal(installProgressLabel(null), "Downloading…");
});

test("only the download can be cancelled", () => {
  assert.equal(cancellable({ Step: "download", Received: 5, Total: 200 }), true);
  assert.equal(cancellable(null), true);
  assert.equal(cancellable({ Step: "verify", Received: 200, Total: 200 }), false);
  assert.equal(cancellable({ Step: "install", Received: 200, Total: 200 }), false);
});

test("a failed install says which check failed and why", () => {
  const cases = [
    ["network", "Download failed"],
    ["signature", "Signature check failed"],
    ["checksum", "Checksum check failed"],
    ["team", "Developer team check failed"],
    ["permissions", "Marasi cannot replace itself"],
    ["install", "Install failed"],
  ];
  for (const [Kind, title] of cases) {
    assert.equal(installFailureMessage({ Kind, Reason: "the reason" }), `${title}: the reason`, Kind);
  }
});

test("a release with no build for this platform says so plainly", () => {
  assert.equal(
    installFailureMessage({ Kind: "no-build", Reason: "this release has no build for your platform (marasi-app)" }),
    "This release has no build for your platform",
  );
});

test("update events move the panel through download, install and failure", () => {
  const update = { Version: "17.10.2026" };
  const available = { Status: "available", Update: update, Progress: null, Failure: null };

  const started = withInstallStarted(available);
  assert.equal(started.Status, "downloading");
  assert.equal(started.Progress, null);

  const downloading = withProgress(started, { Received: 10, Total: 100 });
  assert.equal(downloading.Status, "downloading");
  assert.deepEqual(downloading.Progress, { Received: 10, Total: 100 });

  const installed = withInstalled(downloading, update);
  assert.equal(installed.Status, "restart-pending");
  assert.equal(installed.Progress, null);

  const failure = { Kind: "checksum", Reason: "mismatch", ReleasePage: "https://example" };
  const failed = withFailure(downloading, failure);
  assert.equal(failed.Status, "failed");
  assert.equal(failed.Progress, null);
  assert.deepEqual(failed.Failure, failure);
});

test("progress that arrives after the install ended is ignored", () => {
  const update = { Version: "17.10.2026" };
  const installed = { Status: "restart-pending", Update: update, Progress: null, Failure: null };

  assert.deepEqual(withProgress(installed, { Received: 2, Total: 2 }), installed);
});

test("a cancelled install makes the update available again", () => {
  const update = { Version: "17.10.2026" };
  const downloading = { Status: "downloading", Update: update, Progress: { Received: 1, Total: 2 }, Failure: null };

  const cancelled = withInstallResult(downloading, { Outcome: "cancelled", Update: update });

  assert.equal(cancelled.Status, "available");
  assert.equal(cancelled.Progress, null);
});

test("switching to nightly shows what the immediate check found, or opens the panel for an update", () => {
  const none = channelSwitchNotice(
    { Settings: { Channel: "nightly" }, Check: { Outcome: "none", Channel: "nightly" } },
    running,
  );
  assert.equal(none.message, "You're on the latest nightly build");
  assert.equal(
    channelSwitchNotice(
      { Settings: { Channel: "nightly" }, Check: { Outcome: "available", Channel: "nightly" } },
      running,
    ),
    null,
  );
});

test("switching a nightly to release says the nightly stays until a newer release", () => {
  const nightly = { Channel: "nightly", Version: "17.10.2026 (nightly abc1234)" };

  assert.deepEqual(channelSwitchNotice({ Settings: { Channel: "release" }, Check: null }, nightly), {
    message: "Switched to release. You keep this nightly until a newer release is published; Reinstall latest release goes back now.",
    background: "variant-filled-success",
  });
  assert.equal(
    channelSwitchNotice({ Settings: { Channel: "release" }, Check: null }, running).message,
    "Switched to release",
  );
});

test("a found update makes it available and clears an earlier failure", () => {
  const update = { Version: "18.10.2026" };
  const failed = { Status: "failed", Update: { Version: "17.10.2026" }, Progress: null, Failure: { Kind: "network" } };

  assert.deepEqual(withUpdateFound(failed, update), { Status: "available", Update: update, Progress: null, Failure: null });
});

test("a found update never replaces one downloading or waiting for a restart", () => {
  const installing = { Version: "17.10.2026" };
  const downloading = { Status: "downloading", Update: installing, Progress: { Received: 1, Total: 2 }, Failure: null };
  const installed = { Status: "restart-pending", Update: installing, Progress: null, Failure: null };

  assert.deepEqual(withUpdateFound(downloading, { Version: "18.10.2026" }), downloading);
  assert.deepEqual(withUpdateFound(installed, { Version: "18.10.2026" }), installed);
});

test("the details panel links to the Channel setting in Settings → About", () => {
  assert.equal(channelSettingPath, "/settings?section=about");
});
