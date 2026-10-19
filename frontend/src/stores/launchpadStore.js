// The app's launchpad store, bound to the Wails backend. The logic lives in
// createLaunchpadStore.js, which tests load with a fake API.
import {
  CancelLaunch,
  CreateLaunchpadEntry,
  DeleteLaunchpad,
  GetLaunch,
  GetLaunchpadRequests,
  GetLaunchpads,
  GetRawDetails,
  Launch,
  MoveLaunchpadEntries,
  PendingLaunches,
  SearchLaunchpadEntries,
  SetUnsavedDraftCount,
  UnlinkTraffic,
  UpdateLaunchpadEntry,
} from "../lib/wailsjs/go/main/App";
import { createLaunchpadStore } from "./createLaunchpadStore.js";
import { reportUnsavedDraftCount } from "./draftGuards.js";

export {
  BLANK_REQUEST,
  dirtyLaunchpadIds,
  isDraftDirty,
  isEntrySelected,
  launchOf,
  newestEntryOf,
  pendingEntryIds,
  pendingLaunchOf,
  seededRaw,
  selectedEntryIds,
} from "./createLaunchpadStore.js";

export const launchpadStore = createLaunchpadStore({
  getLaunchpads: () => GetLaunchpads(),
  getEntries: (id) => GetLaunchpadRequests(id),
  getRawDetails: (id) => GetRawDetails(id),
  createLaunchpad: (name, description) => CreateLaunchpadEntry(name, description),
  updateLaunchpad: (id, name, description) =>
    UpdateLaunchpadEntry(id, name, description),
  deleteLaunchpad: (id) => DeleteLaunchpad(id),
  launch: (raw, id, useHttps) => Launch(raw, id, useHttps),
  cancelLaunch: (id) => CancelLaunch(id),
  getLaunch: (id) => GetLaunch(id),
  pendingLaunches: () => PendingLaunches(),
  searchEntries: (query) => SearchLaunchpadEntries(query),
  moveEntries: (sourceId, targetId, ids, before) =>
    MoveLaunchpadEntries(sourceId, targetId, ids, before),
  unlinkEntries: (launchpadId, ids) =>
    UnlinkTraffic({ ids }, { Kind: "launchpad", ID: launchpadId }),
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
