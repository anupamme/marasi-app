// The opening screen's state for one open of a project: the steps, the
// sentence and the progress, built from the open's log events, the load
// sequence's part signals and the open's outcome. No Svelte or Wails here:
// this is the opening screen's test seam (see openProgress.test.js).
//
// The state is a plain object; each `with…` function returns a new one, and
// `openingScreen` turns it into what the screen renders.

import { codeIDs } from "./errorCodes.js";

// The open's steps in order. `running` is the label while the step runs,
// `failed` the label once it failed, when it differs from `label`.
const openSteps = [
  { id: "lock", label: "Lock", running: "Locking", failed: "Locked", sentence: "Checking the project lock." },
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
 * null at startup; `currentPath` is its path, when known.
 */
export function openingFor({ name, path = null, currentProject = null, currentPath = null }) {
  return {
    name,
    path,
    currentProject,
    currentPath,
    recents: [],
    step: 0,
    upgradeFile: null,
    upgradesApplied: 0,
    part: 0,
    log: [],
    failure: null,
  };
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
  if (typeof log?.level !== "string" || state.step === opened || state.failure) return state;
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

/**
 * Records that the app's Go side opened the target and released the
 * project open before: from here the open project is the target, even if
 * loading it fails.
 */
export function withSwitched(state) {
  return {
    ...state,
    step: Math.max(state.step, stepIndex.load),
    currentProject: state.name,
    currentPath: state.path,
  };
}

/** Records that the open succeeded: the project is open and loaded. */
export function withOpened(state) {
  return { ...state, step: opened };
}

/**
 * Records that the open failed with `error`, as the app's Go side returned
 * it. A locked project (the `project_locked` code: another Marasi owns it)
 * fails the Lock step; any other error fails the step that was running.
 */
export function withFailed(state, error) {
  const text = String(error ?? "");
  const locked = codeIDs(text, "project_locked") !== null;
  return {
    ...state,
    step: locked ? stepIndex.lock : Math.min(state.step, stepIndex.load),
    failure: { kind: locked ? "locked" : "other", error: text },
    // Details ends with the error, as returned.
    log: [...state.log, text],
  };
}

/**
 * Feeds the recent projects, as GetRecentProjects returns them
 * (`{ProjectName: <path>, Date: <Go time>}`), to pick from after a failure.
 */
export function withRecents(state, recents) {
  const projects = (recents ?? []).map(({ ProjectName, Date: date }) => ({
    name: projectName(ProjectName),
    path: ProjectName,
    at: goTime(date),
  }));
  // Most recent first; a date that doesn't parse goes last.
  projects.sort((a, b) => (Number.isNaN(b.at) ? -Infinity : b.at) - (Number.isNaN(a.at) ? -Infinity : a.at));
  return { ...state, recents: projects.map(({ name, path }) => ({ name, path })) };
}

// A project file's name without its directory or ".marasi".
const projectName = (path) =>
  String(path)
    .split(/[\\/]/)
    .pop()
    .replace(/\.marasi$/, "");

// Go's time.Time.String(), "2006-01-02 15:04:05.999999999 -0700 MST", as
// epoch ms; WebKit's Date doesn't parse it as is. NaN when it doesn't match.
function goTime(text) {
  const match = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)(?:\.(\d+))? ([+-]\d\d)(\d\d)/.exec(String(text ?? ""));
  if (!match) return NaN;
  const [, day, time, fraction = "0", hours, minutes] = match;
  return Date.parse(`${day}T${time}.${fraction.padEnd(3, "0").slice(0, 3)}${hours}:${minutes}`);
}

// Whether a recent project is `name` at `path`: by path when both are
// known, else by name (projects opened by bare name live in the config dir,
// as every recent project does).
const isProject = (recent, name, path) =>
  recent.path && path ? recent.path === path : recent.name === name;

/** Everything the opening screen renders. */
export function openingScreen(state) {
  const { failure } = state;
  const steps = openSteps.map(({ id, label, running, failed }, i) => {
    let mark = "todo";
    if (i === state.step) mark = failure ? "failed" : "current";
    else if (i < state.step) mark = "done";
    if (mark === "current") return { id, label: running, mark };
    if (mark === "failed") return { id, label: failed ?? label, mark };
    return { id, label, mark };
  });
  const loading = !failure && state.step === stepIndex.load;
  const part = loading ? loadParts[state.part].label : null;
  let sentence = "Opened.";
  if (failure?.kind === "locked") sentence = "Open in another Marasi.";
  else if (failure) sentence = "Couldn't open the project.";
  else if (loading) sentence = `Loading ${part.toLowerCase()}.`;
  else if (state.step < opened) sentence = openSteps[state.step].sentence;
  return {
    project: { name: state.name, path: state.path },
    steps,
    sentence,
    upgrade:
      !failure && state.step === stepIndex.upgrade && state.upgradeFile
        ? { file: state.upgradeFile, applied: state.upgradesApplied }
        : null,
    load: {
      part,
      done: state.step === opened ? loadParts.length : loading ? state.part : 0,
      total: loadParts.length,
    },
    failure,
    // Stay in names the project still open, if any; only a locked project
    // may open on a retry, once the other Marasi lets it go.
    actions: failure ? { stayIn: state.currentProject, tryAgain: failure.kind === "locked" } : null,
    // The projects to open instead, most recent first: the first is the
    // one picked by default. The target and the open project aren't
    // choices.
    choices: state.recents.filter(
      (recent) =>
        !isProject(recent, state.name, state.path) &&
        !(state.currentProject !== null && isProject(recent, state.currentProject, state.currentPath)),
    ),
    log: state.log,
  };
}
