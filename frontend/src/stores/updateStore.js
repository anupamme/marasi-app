import { writable } from "svelte/store";
import {
  CancelUpdateDownload,
  DismissUpdate,
  GetUpdateState,
  InstallUpdate,
  RestartToUpdate,
} from "../lib/wailsjs/go/main/App";
import {
  withFailure,
  withInstallResult,
  withInstallStarted,
  withInstalled,
  withProgress,
} from "../lib/updates.js";

// The app's update state (the Go UpdateState): what the update indicator and
// details panel show. Refreshed from Go on load, so a reloaded frontend shows
// an update found, downloading or installed before it reloaded, and updated
// by update events.
export const updateState = writable({
  Status: "unavailable",
  Channel: "",
  Running: null,
  Update: null,
  CanInstall: false,
  CannotInstallReason: "",
  Progress: null,
  Failure: null,
});

/** Reads the current update state from Go. */
export function refreshUpdateState() {
  return GetUpdateState()
    .then((state) => updateState.set(state))
    .catch((err) => console.error("Reading the update state failed:", err));
}

/**
 * Hides the available update until a newer build is published. Resolves with
 * the new state; rejects when the dismissal could not be saved.
 */
export function dismissUpdate() {
  return DismissUpdate().then((state) => {
    updateState.set(state);
    return state;
  });
}

/** Records an update found by a check (the update-available event). */
export function onUpdateAvailable(update) {
  updateState.update((state) => ({ ...state, Status: "available", Update: update, Failure: null }));
}

/** Records download progress (the update-progress event). */
export function onUpdateProgress(progress) {
  updateState.update((state) => withProgress(state, progress));
}

/** Records an installed update waiting for a restart (the update-installed event). */
export function onUpdateInstalled(update) {
  updateState.update((state) => withInstalled(state, update));
}

/** Records a failed install (the update-failed event). */
export function onUpdateFailed(failure) {
  updateState.update((state) => withFailure(state, failure));
}

/** Installs the known update; progress and the outcome also arrive as events. */
export function installUpdate() {
  updateState.update(withInstallStarted);
  return InstallUpdate()
    .then((result) => updateState.update((state) => withInstallResult(state, result)))
    .catch((err) => {
      console.error("Installing the update failed:", err);
      return refreshUpdateState();
    });
}

/** Aborts the running download. */
export function cancelUpdateDownload() {
  return CancelUpdateDownload();
}

/** "Restart now": resolves to whether Marasi is restarting. */
export function restartToUpdate() {
  return RestartToUpdate();
}
