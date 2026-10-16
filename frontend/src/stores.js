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
import { readHighlights } from "./stores/highlightsStore";
import { ledgerStore } from "./stores/ledgerStore";
import { recentTraffic } from "./stores/recentTrafficStore";

// Startup
export const appState = writable({
  isReady: false,
  message: "Starting...",
  details: "",
});

// Extensions
export const extensions = writable([]);
export const extensions_ui = writable({});

// Ledger Stores. The rest of the Ledger's state is in ledgerStore.
export const contentTypeFilterInput = writable("");

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
 * Turns a backend log event from opening a project into splash-screen text,
 * or returns null for events the splash ignores. Migrations log one record
 * per statement through goose, with the migration file as `source`.
 */
export function projectOpenMessage(log) {
  const data = log?.data;
  if (data?.logger === "goose" && data.source) {
    return `Upgrading project database (${data.source})…`;
  }
  if (data?.component !== "db") return null;
  if (log.message === "Connecting to SQLite...") {
    return "Opening project database…";
  }
  if (log.message === "Migrations completed") {
    return "Project database upgraded";
  }
  return log.message;
}

export async function openProject() {
  appState.set({
    isReady: false,
    message: "Loading " + get(activeProject) + "…",
    details: "",
  });
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
  contentTypeFilterInput.set("");
  compassCode.set("");
  testerInput.set("");
  checkpointCode.set("");
  interceptFlag.set(false);
  workshopCode.set("");
  waypoints.set({});
  ledgerStore.clear();
  recentTraffic.clear();
  extensions.set([]);
  extensions_ui.set({});
  testCaseStore.clear();
  findingStore.clear();
  connectionStore.clear();
  armoryStore.clear();
  launchpadStore.clear();
  try {
    await LoadExtensions();
  } catch (err) {
    console.error("Failed to load project extensions:", err);
  }

  // Reset items. The Ledger's first page, its exclusion and the recent
  // traffic for extensions load in the background.
  ledgerStore.populate();
  recentTraffic.populate();
  await populateLogs();
  await populateScope();
  await populateCheckpoint();
  await populateWorkshop();
  await populateWaypoints();
  await populateExtensions();
  await testCaseStore.populate();
  await findingStore.populate();
  await connectionStore.populateInterceptFlag();
  await armoryStore.populate();
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
