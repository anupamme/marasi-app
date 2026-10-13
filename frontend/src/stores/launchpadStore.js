// The app's launchpad store, bound to the Wails backend. The logic lives in
// createLaunchpadStore.js, which tests load with a fake API.
import {
  CreateLaunchpadEntry,
  DeleteLaunchpad,
  GetLaunchpadRequests,
  GetLaunchpads,
  GetRawDetails,
  Repeat,
  SetUnsavedDraftCount,
  UpdateLaunchpadEntry,
} from "../lib/wailsjs/go/main/App";
import { createLaunchpadStore } from "./createLaunchpadStore.js";
import { reportUnsavedDraftCount } from "./draftGuards.js";

export {
  BLANK_REQUEST,
  compareQuickPick,
  dirtyLaunchpadIds,
  isDraftDirty,
  seededRaw,
} from "./createLaunchpadStore.js";

export const launchpadStore = createLaunchpadStore({
  getLaunchpads: () => GetLaunchpads(),
  getEntries: (id) => GetLaunchpadRequests(id),
  getRawDetails: (id) => GetRawDetails(id),
  createLaunchpad: (name, description) => CreateLaunchpadEntry(name, description),
  updateLaunchpad: (id, name, description) =>
    UpdateLaunchpadEntry(id, name, description),
  deleteLaunchpad: (id) => DeleteLaunchpad(id),
  launch: (raw, id, useHttps) => Repeat(raw, id, useHttps),
});

// Keeps the Go side told how many launchpads have unsaved drafts, so quitting
// or switching the project can ask first. Returns the unsubscribe function.
export function reportUnsavedDrafts() {
  return reportUnsavedDraftCount(launchpadStore, (count) =>
    SetUnsavedDraftCount(count).catch((err) =>
      console.error("reporting unsaved launchpad drafts:", err),
    ),
  );
}
