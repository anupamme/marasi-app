import { get, writable } from "svelte/store";
import {
  GetLogs,
  GetMarasiConfig,
  GetKeybindings,
  GetExtensionCode,
  GetWaypoints,
  GetInterceptFlag,
  GetExtensions,
  LoadExtensions,
  GetUserName,
} from "./lib/wailsjs/go/main/App";
import { testCaseStore } from "./stores/testCaseStore";
import { findingStore } from "./stores/findingStore";
import { connectionStore } from "./stores/connectionStore";
import { armoryStore } from "./stores/armoryStore";
import { launchpadStore } from "./stores/launchpadStore";
import { highlightsStore, readHighlights } from "./stores/highlightsStore";
import { ledgerStore } from "./stores/ledgerStore";
import { sitemapStore } from "./stores/sitemapStore";
import { jobsStore } from "./stores/jobsStore";
import { recentTraffic } from "./stores/recentTrafficStore";
import { savedQueriesStore } from "./stores/savedQueriesStore";
import { openingFor, withLoadPart, withOpened, withOpenLog } from "./lib/openProgress.js";

// Startup
export const appState = writable({
  isReady: false,
  message: "Starting...",
  details: "",
});

// Extensions
export const extensions = writable([]);
export const extensions_ui = writable({});

// Logbook Stores
export const logbookSearchInput = writable("");
export const reportMetadata = writable({
  title: "Report Title",
  client: "Client Name",
  type: "Assessment Type",
  is_draft: true,
  scope: "Assessment Scope",
  assessor: "Assessor",
  start: new Date(
    new Date().setDate(new Date().getDate() - 14),
  ).toLocaleDateString("en-CA"),
  end: new Date().toLocaleDateString("en-CA"),
  created_at: new Date().toISOString(),
  truncate_length: 0,
  custom_properties: {},
});

// ---------------------------
// Compass
export const compassCode = writable("");
export const testerInput = writable("");

// Waypoint
export const waypoints = writable({});

// Checkpont
export const checkpointCode = writable("");
export const interceptFlag = writable(false);

// Workshop
export const workshopCode = writable("");

export const logItems = writable([]);
export const extensionElements = writable({});
export const prettify = writable(true);
export const lineWrap = writable(true);

export let drawerHeight = writable("h-[60%]");
export let marasiConfig = writable({});
export async function readConfig() {
  const config = await GetMarasiConfig();
  marasiConfig.set(config);
  await Promise.all([readKeybindings(), readHighlights()]);
}

// Saved keybinding profiles ({ config, problem }) from the app config; the
// global menu hands them to the shortcut dispatcher.
export const keybindingState = writable(null);
export async function readKeybindings() {
  try {
    keybindingState.set(await GetKeybindings());
  } catch (error) {
    console.error("reading keybindings, using factory shortcuts:", error);
  }
}

export let listener = writable({
  status: false,
  address: "127.0.0.1",
  port: "8080",
});
export let activeProject = writable("Marasi");
/**
 * The open in progress, as lib/openProgress.js's state, or null. The
 * opening screen in the root layout renders it while the app isn't ready.
 */
export const opening = writable(null);
/**
 * Starts the opening screen's state for opening `name` at `path` (null when
 * only a bare name is known), with `currentProject` the project open now.
 */
export function startOpening({ name, path = null, currentProject = null }) {
  opening.set(openingFor({ name, path, currentProject }));
}
/** Feeds a backend log event to the open in progress, if any. */
export function feedOpeningLog(log) {
  opening.update((state) => state && withOpenLog(state, log));
}
/** Records that the open in progress succeeded. */
export function finishOpening() {
  opening.update((state) => state && withOpened(state));
}
/** Drops the open in progress, as after a failed or cancelled open. */
export function clearOpening() {
  opening.set(null);
}
// Signals that the load sequence starts loading `signal`.
function loadPart(signal) {
  opening.update((state) => state && withLoadPart(state, signal));
}

export async function openProject() {
  appState.set({
    isReady: false,
    message: "Loading " + get(activeProject) + "…",
    details: "",
  });
  // Each loadPart signal tells the opening screen which part loads next.
  loadPart("traffic");
  logbookSearchInput.set("");
  reportMetadata.set({
    title: get(activeProject) + " Report",
    client: "Client Name",
    type: "Assessment Type",
    is_draft: true,
    scope: "Assessment Scope",
    assessor: await GetUserName(),
    start: new Date(
      new Date().setDate(new Date().getDate() - 14),
    ).toLocaleDateString("en-CA"),
    end: new Date().toLocaleDateString("en-CA"),
    created_at: new Date().toISOString(),
    truncate_length: 0,
    custom_properties: {},
  });
  compassCode.set("");
  testerInput.set("");
  checkpointCode.set("");
  interceptFlag.set(false);
  workshopCode.set("");
  waypoints.set({});
  ledgerStore.clear();
  sitemapStore.clear();
  jobsStore.clear();
  recentTraffic.clear();
  // Project saved queries belong to the project just opened.
  savedQueriesStore.loadProject();
  extensions.set([]);
  extensions_ui.set({});
  testCaseStore.clear();
  findingStore.clear();
  connectionStore.clear();
  armoryStore.clear();
  launchpadStore.clear();
  // The Ledger's first page and its exclusion load in the background, and
  // first: it is the page researchers open, and its rows don't wait on the
  // project's extensions.
  ledgerStore.populate();
  loadPart("extensions");
  try {
    await LoadExtensions();
  } catch (err) {
    console.error("Failed to load project extensions:", err);
  }

  // Reset items. The recent traffic for extensions loads in the background.
  recentTraffic.populate();
  // Marasi's background jobs, polled while one runs.
  jobsStore.refresh();
  // The project's highlight labels, then its old hex highlights migrated in
  // the background; the Ledger reloads once they are numbers.
  highlightsStore.openProject({ onMigrated: () => ledgerStore.reload() });
  loadPart("logs");
  await populateLogs();
  loadPart("scope");
  await populateScope();
  loadPart("checkpoint");
  await populateCheckpoint();
  loadPart("workshop");
  await populateWorkshop();
  loadPart("waypoints");
  await populateWaypoints();
  loadPart("extension-list");
  await populateExtensions();
  loadPart("test-cases");
  await testCaseStore.populate();
  loadPart("findings");
  await findingStore.populate();
  loadPart("intercept");
  await connectionStore.populateInterceptFlag();
  loadPart("armory");
  await armoryStore.populate();
  loadPart("launchpads");
  await launchpadStore.populate();
}

export async function populateWaypoints() {
  GetWaypoints()
    .then((points) => {
      console.log(points);
      waypoints.set(points);
    })
    .catch((waypointErr) => {
      console.log(waypointErr);
    });
}
export async function populateWorkshop() {
  GetExtensionCode("workshop")
    .then((code) => {
      workshopCode.set(code);
    })
    .catch((error) => {
      console.log(error);
    });
}
export async function populateCheckpoint() {
  GetExtensionCode("checkpoint")
    .then((code) => {
      checkpointCode.set(code);
    })
    .catch((error) => {
      console.log(error);
    });
  GetInterceptFlag().then((flag) => {
    interceptFlag.set(flag);
  });
}
export async function populateScope() {
  GetExtensionCode("compass")
    .then((code) => {
      compassCode.set(code);
    })
    .catch((error) => {
      console.log(error);
    });
}
export async function populateLogs() {
  GetLogs().then((items) => {
    console.log(items);
    logItems.set(items ? items : []);
  });
}
export async function populateExtensions() {
  GetExtensions().then((exts) => {
    console.log(exts);
    extensions.set(exts ? exts : []);
  });
}
