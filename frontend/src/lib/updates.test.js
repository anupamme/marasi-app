import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkResultNotice,
  installFailureMessage,
  progressPercent,
  showsUpdateIndicator,
  updateIndicatorLabel,
  withFailure,
  withInstallResult,
  withInstallStarted,
  withInstalled,
  withProgress,
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
