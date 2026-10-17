import { writable } from "svelte/store";
import { DismissUpdate, GetUpdateState } from "../lib/wailsjs/go/main/App";

// The app's update state (the Go UpdateState): what the update indicator and
// details panel show. Refreshed from Go on load, so a reloaded frontend shows
// an update found before it reloaded, and updated by update events.
export const updateState = writable({ Status: "unavailable", Channel: "", Running: null, Update: null });

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
  updateState.update((state) => ({ ...state, Status: "available", Update: update }));
}
