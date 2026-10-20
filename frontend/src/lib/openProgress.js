// The opening screen's state for one open of a project: the steps, the
// sentence and the progress, built from the open's log events, the load
// sequence's part signals and the open's outcome. No Svelte or Wails here:
// this is the opening screen's test seam (see openProgress.test.js).
//
// The state is a plain object; each `with…` function returns a new one, and
// `openingScreen` turns it into what the screen renders.

// The open's steps in order. `running` is the label while the step runs.
const openSteps = [
  { id: "lock", label: "Lock", running: "Locking", sentence: "Checking the project lock." },
  { id: "open", label: "Open", running: "Opening", sentence: "Opening the database." },
  { id: "upgrade", label: "Upgrade", running: "Upgrading", sentence: "Upgrading the database. Keep Marasi open." },
  { id: "load", label: "Load", running: "Loading" },
];
const stepIndex = Object.fromEntries(openSteps.map(({ id }, i) => [id, i]));
// Past the last step: the open succeeded.
const opened = openSteps.length;

// The project's parts, in the order the load sequence (openProject in
// stores.js) loads them, and the signals each part covers.
const loadParts = [
  { label: "Traffic", signals: ["traffic"] },
  { label: "Extensions", signals: ["extensions", "logs"] },
  { label: "Scope & checkpoint", signals: ["scope", "checkpoint", "workshop", "waypoints", "extension-list"] },
  { label: "Findings & test cases", signals: ["test-cases", "findings", "intercept", "armory"] },
  { label: "Launchpads", signals: ["launchpads"] },
];
const partOfSignal = new Map(loadParts.flatMap(({ signals }, i) => signals.map((signal) => [signal, i])));

/**
 * Starts the state for opening the project `name` at `path` (null while the
 * full path is unknown). `currentProject` names the project open now, or is
 * null at startup.
 */
export function openingFor({ name, path = null, currentProject = null }) {
  return { name, path, currentProject, step: 0, upgradeFile: null, upgradesApplied: 0, part: 0, log: [] };
}

/**
 * Feeds one log event from the open: the app's slog records from the db
 * component and from goose, which logs one record per migration statement
 * with the migration file as `source`. Other events are ignored.
 */
export function withOpenLog(state, log) {
  const data = log?.data;
  // Marasi's own proxy logs (capitalised fields) and other components'
  // records aren't part of the open.
  if (typeof log?.level !== "string" || state.step === opened) return state;
  const isGoose = data?.logger === "goose";
  if (!isGoose && data?.component !== "db") return state;

  let step = state.step;
  // The lock writes no log; connecting to the database means it's held.
  if (log.message === "Connecting to SQLite...") step = Math.max(step, stepIndex.open);
  else if (isGoose) step = Math.max(step, stepIndex.upgrade);
  else if (log.message === "Migrations completed" || log.message === "Migrations up to date") {
    step = Math.max(step, stepIndex.load);
  }

  // Marasi logs the upgrade's total only once it has finished, so count
  // the upgrade files seen instead: each new source is one more applied.
  let { upgradeFile, upgradesApplied } = state;
  const source = isGoose ? data.source : null;
  if (source && source !== upgradeFile) {
    if (upgradeFile) upgradesApplied += 1;
    upgradeFile = source;
  }
  // A project opened by bare name has no path until its database says.
  const path = state.path ?? (!isGoose && typeof data.path === "string" ? data.path : null);
  return { ...state, step, upgradeFile, upgradesApplied, path, log: [...state.log, logLine(log)] };
}

// One log event as a Details line: its time, level, message and fields,
// as logged.
function logLine({ timestamp, level, message, data }) {
  const fields = Object.entries(data ?? {}).map(([key, value]) => {
    const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
    return ` ${key}=${text}`;
  });
  return `${timestamp} ${level} ${message}${fields.join("")}`;
}

/**
 * Feeds the load sequence's signal that `signal` starts loading. Parts
 * only move forward; unknown signals are ignored.
 */
export function withLoadPart(state, signal) {
  const part = partOfSignal.get(signal);
  if (part === undefined || part <= state.part) return state;
  return { ...state, part };
}

/** Records that the open succeeded: the project is open and loaded. */
export function withOpened(state) {
  return { ...state, step: opened };
}

/** Everything the opening screen renders. */
export function openingScreen(state) {
  const steps = openSteps.map(({ id, label, running }, i) => {
    let mark = "todo";
    if (i === state.step) mark = "current";
    else if (i < state.step) mark = "done";
    return { id, label: mark === "current" ? running : label, mark };
  });
  const loading = state.step === stepIndex.load;
  const part = loading ? loadParts[state.part].label : null;
  let sentence = "Opened.";
  if (loading) sentence = `Loading ${part.toLowerCase()}.`;
  else if (state.step < opened) sentence = openSteps[state.step].sentence;
  return {
    project: { name: state.name, path: state.path },
    steps,
    sentence,
    upgrade:
      state.step === stepIndex.upgrade && state.upgradeFile
        ? { file: state.upgradeFile, applied: state.upgradesApplied }
        : null,
    load: {
      part,
      done: state.step === opened ? loadParts.length : loading ? state.part : 0,
      total: loadParts.length,
    },
    log: state.log,
  };
}
