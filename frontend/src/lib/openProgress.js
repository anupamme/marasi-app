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
// The step index past the last step: the open succeeded.
const succeededStep = openSteps.length;

/**
 * The load sequence's signals (openProject in stores.js), one as each
 * thing it loads starts loading, in the order it loads them.
 */
export const loadSignals = Object.freeze({
  traffic: "traffic",
  extensions: "extensions",
  logs: "logs",
  scope: "scope",
  checkpoint: "checkpoint",
  workshop: "workshop",
  waypoints: "waypoints",
  extensionList: "extension-list",
  testCases: "test-cases",
  findings: "findings",
  intercept: "intercept",
  armory: "armory",
  launchpads: "launchpads",
});

// The project's parts, in load order, and the signals each part covers.
const signal = loadSignals;
const loadParts = [
  { label: "Traffic", signals: [signal.traffic] },
  { label: "Extensions", signals: [signal.extensions, signal.logs] },
  {
    label: "Scope & checkpoint",
    signals: [signal.scope, signal.checkpoint, signal.workshop, signal.waypoints, signal.extensionList],
  },
  { label: "Findings & test cases", signals: [signal.testCases, signal.findings, signal.intercept, signal.armory] },
  { label: "Launchpads", signals: [signal.launchpads] },
];
const partOfSignal = new Map(loadParts.flatMap(({ signals }, i) => signals.map((signal) => [signal, i])));

/**
 * Starts the state for opening the project `name` at `path` (null while the
 * full path is unknown). `current` is the project open now, `{name, path}`
 * (path null when unknown), or null at startup. `scratchpad` marks the
 * scratchpad, which startup opens first.
 */
export function openingFor({ name, path = null, current = null, scratchpad = false }) {
  return {
    name,
    path,
    scratchpad,
    current,
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
  if (typeof log?.level !== "string" || state.step === succeededStep || state.failure) return state;
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
    current: { name: state.name, path: state.path },
  };
}

/** Records that the open succeeded: the project is open and loaded. */
export function withOpened(state) {
  return { ...state, step: succeededStep };
}

/**
 * Records that the open failed with `error`, as the app's Go side returned
 * it. A locked project (the `project_locked` code: another Marasi owns it)
 * fails the Lock step; any other error fails the step that was running.
 */
export function withFailed(state, error) {
  const text = String(error ?? "");
  const locked = codeIDs(text, "project_locked") !== null;
  // Marasi's lock error names the project's file: "project already open: <path>".
  const lockedPath = locked ? (/project already open: (.+)$/.exec(text)?.[1] ?? null) : null;
  return {
    ...state,
    path: state.path ?? lockedPath,
    step: locked ? stepIndex.lock : Math.min(state.step, stepIndex.load),
    failure: { kind: locked ? "locked" : "other", error: text },
    // Details ends with the error, as returned.
    log: [...state.log, text],
  };
}

/**
 * Feeds the recent projects, as GetRecentProjects returns them
 * (`{ProjectName: <path>, Date: <Go time>}`), to pick from after a failure.
 * `now` (epoch ms) is when they're listed, for how long ago each opened.
 */
export function withRecents(state, recents, now = Date.now()) {
  const projects = (recents ?? []).map(({ ProjectName, Date: date }) => ({
    name: projectName(ProjectName),
    path: ProjectName,
    at: goTime(date),
    opened: openedAgo(date, now),
  }));
  // Most recent first; a date that doesn't parse goes last.
  projects.sort((a, b) => (Number.isNaN(b.at) ? -Infinity : b.at) - (Number.isNaN(a.at) ? -Infinity : a.at));
  return { ...state, recents: projects.map(({ name, path, opened }) => ({ name, path, opened })) };
}

/** A project file's name, without its directory or ".marasi". */
export const projectName = (path) =>
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

// How long before `now` a project last opened, from Go's time `text`:
// "Just now", "20 minutes ago", "Yesterday", "Last week", up to four weeks,
// then the day it opened ("2026-08-02"). Empty when the time doesn't parse.
function openedAgo(text, now) {
  const at = goTime(text);
  if (Number.isNaN(at)) return "";
  const minutes = Math.floor(Math.max(0, now - at) / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const ago = (count, unit) => `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  if (minutes < 1) return "Just now";
  if (hours < 1) return ago(minutes, "minute");
  if (days < 1) return ago(hours, "hour");
  if (days === 1) return "Yesterday";
  if (weeks < 1) return ago(days, "day");
  if (weeks === 1) return "Last week";
  if (weeks < 5) return ago(weeks, "week");
  // The day as Go wrote it, in the time zone it was written in.
  return String(text).slice(0, 10);
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
  if (failure?.kind === "locked") {
    const project = state.scratchpad ? "The scratchpad" : "The project";
    sentence = `${project} is opened by another instance.`;
  }
  else if (failure) sentence = "Couldn't open the project.";
  else if (loading) sentence = `Loading ${part.toLowerCase()}.`;
  else if (state.step < succeededStep) sentence = openSteps[state.step].sentence;
  return {
    project: { name: state.name, path: state.path },
    // The project that opened, once the open succeeded: what startup and
    // the window title take the project's name from.
    opened: state.step === succeededStep ? { name: state.name, path: state.path } : null,
    steps,
    sentence,
    upgrade:
      !failure && state.step === stepIndex.upgrade && state.upgradeFile
        ? { file: state.upgradeFile, applied: state.upgradesApplied }
        : null,
    load: {
      part,
      done: state.step === succeededStep ? loadParts.length : loading ? state.part : 0,
      total: loadParts.length,
    },
    failure,
    // Stay in names the project still open, if any; only a locked project
    // may open on a retry, once the other Marasi lets it go.
    actions: failure ? { stayIn: state.current?.name ?? null, tryAgain: failure.kind === "locked" } : null,
    // With no project open (at startup) there's nothing to stay in, so the
    // list is the way forward.
    choicesLabel: state.current === null ? "Open a project instead" : "Open another project",
    // The projects to open instead, most recent first: the first is the
    // one picked by default. The target and the open project aren't
    // choices.
    choices: state.recents.filter(
      (recent) =>
        !isProject(recent, state.name, state.path) &&
        !(state.current !== null && isProject(recent, state.current.name, state.current.path)),
    ),
    log: state.log,
  };
}
