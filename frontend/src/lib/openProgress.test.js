import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openingFor,
  openingScreen,
  withFailed,
  withLoadPart,
  withOpened,
  withOpenLog,
  withRecents,
  withSwitched,
} from "./openProgress.js";

// The opening screen's steps as "label:mark" pairs, for compact assertions.
const marks = (state) => openingScreen(state).steps.map((step) => `${step.label}:${step.mark}`);

// Log events as the app's slog relay emits them while a project opens.
const db = (message, data = {}) => ({ message, level: "INFO", timestamp: "08:40:21", data: { component: "db", ...data } });
const goose = (message, data = {}) => ({ message, level: "INFO", timestamp: "08:40:21", data: { logger: "goose", ...data } });

const replay = (state, events) => events.reduce(withOpenLog, state);
const acme = () => openingFor({ name: "acme-portal", path: "/Users/r/acme-portal.marasi", current: { name: "scratchpad", path: null } });

test("an open starts by checking the project lock, under the project's name and path", () => {
  const screen = openingScreen(acme());

  assert.deepEqual(screen.project, { name: "acme-portal", path: "/Users/r/acme-portal.marasi" });
  assert.deepEqual(marks(acme()), ["Locking:current", "Open:todo", "Upgrade:todo", "Load:todo"]);
  assert.equal(screen.sentence, "Checking the project lock.");
});

test("connecting to the database means the lock is held, and the database is opening", () => {
  const state = replay(acme(), [db("Connecting to SQLite...", { path: "/Users/r/acme-portal.marasi" })]);

  assert.deepEqual(marks(state), ["Lock:done", "Opening:current", "Upgrade:todo", "Load:todo"]);
  assert.equal(openingScreen(state).sentence, "Opening the database.");
});

test("an up-to-date database ticks Upgrade straight away and moves on to Load", () => {
  const state = replay(acme(), [
    db("Connecting to SQLite..."),
    goose("no migrations to run", { current_version: 25 }),
    db("Migrations up to date", { count: 0 }),
  ]);

  assert.deepEqual(marks(state), ["Lock:done", "Open:done", "Upgrade:done", "Loading:current"]);
  assert.equal(openingScreen(state).upgrade, null);
});

test("a database upgrade shows the running upgrade file and counts each new file as one more applied", () => {
  const opened = replay(acme(), [db("Connecting to SQLite...")]);
  const first = replay(opened, [
    goose("executing statement", { source: "00022_pair_number.sql", statement: "ALTER TABLE …" }),
    goose("executing statement", { source: "00022_pair_number.sql", statement: "UPDATE …" }),
  ]);
  assert.deepEqual(marks(first), ["Lock:done", "Open:done", "Upgrading:current", "Load:todo"]);
  assert.equal(openingScreen(first).sentence, "Upgrading the database. Keep Marasi open.");
  assert.deepEqual(openingScreen(first).upgrade, { file: "00022_pair_number.sql", applied: 0 });

  const third = replay(first, [
    goose("migration completed", { source: "00022_pair_number.sql", state: "applied" }),
    goose("executing statement", { source: "00023_dashboard_counts.sql" }),
    goose("migration completed", { source: "00023_dashboard_counts.sql", state: "applied" }),
    // A Go migration logs no statements, only its completion.
    goose("migration completed", { source: "00025_launchpad_entry_order.go", state: "applied" }),
  ]);
  assert.deepEqual(openingScreen(third).upgrade, { file: "00025_launchpad_entry_order.go", applied: 2 });

  const done = replay(third, [
    goose("successfully migrated database", { current_version: 25 }),
    db("Migrations completed", { count: 3 }),
  ]);
  assert.deepEqual(marks(done), ["Lock:done", "Open:done", "Upgrade:done", "Loading:current"]);
  assert.equal(openingScreen(done).upgrade, null);
});

const upToDate = [db("Connecting to SQLite..."), db("Migrations up to date", { count: 0 })];

test("the Load step says which part of the project is loading and how many of the five are done", () => {
  const ready = replay(acme(), upToDate);
  assert.equal(openingScreen(ready).sentence, "Loading traffic.");
  assert.deepEqual(openingScreen(ready).load, { part: "Traffic", done: 0, total: 5 });

  const load = (...parts) => openingScreen(parts.reduce(withLoadPart, ready));
  assert.deepEqual(load("traffic").load, { part: "Traffic", done: 0, total: 5 });
  assert.deepEqual(load("traffic", "extensions").load, { part: "Extensions", done: 1, total: 5 });
  assert.equal(load("traffic", "extensions", "logs").load.part, "Extensions");
  assert.deepEqual(load("traffic", "extensions", "logs", "scope").load, { part: "Scope & checkpoint", done: 2, total: 5 });
  assert.equal(load("traffic", "extensions", "logs", "scope").sentence, "Loading scope & checkpoint.");
  assert.deepEqual(load("scope", "checkpoint", "workshop", "waypoints", "extension-list").load.done, 2);
  assert.deepEqual(load("test-cases", "findings", "intercept", "armory").load, {
    part: "Findings & test cases",
    done: 3,
    total: 5,
  });
  assert.deepEqual(load("launchpads").load, { part: "Launchpads", done: 4, total: 5 });
  assert.equal(load("launchpads").sentence, "Loading launchpads.");
  assert.deepEqual(marks(["launchpads"].reduce(withLoadPart, ready)), ["Lock:done", "Open:done", "Upgrade:done", "Loading:current"]);
});

test("a part signalled before the database is open doesn't skip ahead, and parts never move back", () => {
  assert.deepEqual(marks(withLoadPart(acme(), "traffic")), ["Locking:current", "Open:todo", "Upgrade:todo", "Load:todo"]);
  const ready = replay(acme(), upToDate);
  assert.equal(openingScreen(["scope", "traffic"].reduce(withLoadPart, ready)).load.part, "Scope & checkpoint");
});

test("a quick open ends with every step ticked and the sentence Opened.", () => {
  const state = withOpened(replay(acme(), upToDate));

  assert.deepEqual(marks(state), ["Lock:done", "Open:done", "Upgrade:done", "Load:done"]);
  assert.equal(openingScreen(state).sentence, "Opened.");
  assert.equal(openingScreen(state).upgrade, null);
  assert.deepEqual(openingScreen(state).load, { part: null, done: 5, total: 5 });
});

test("log events after the open succeeded aren't part of it", () => {
  const state = withOpened(replay(acme(), upToDate));
  const later = withOpenLog(state, db("Connecting to SQLite...", { path: "/elsewhere.marasi" }));

  assert.deepEqual(marks(later), ["Lock:done", "Open:done", "Upgrade:done", "Load:done"]);
  assert.equal(openingScreen(later).log.length, 2);
});

test("an open that succeeds before any log event still ends with every step ticked", () => {
  assert.deepEqual(marks(withOpened(acme())), ["Lock:done", "Open:done", "Upgrade:done", "Load:done"]);
});

test("Details lists the open's log lines unchanged, in order, and leaves out logs from outside the open", () => {
  const state = replay(acme(), [
    db("Connecting to SQLite...", { path: "/Users/r/acme-portal.marasi" }),
    { Level: "INFO", Message: "proxy request", Source: "proxy" },
    { message: "Listener started", level: "INFO", timestamp: "08:40:22", data: { component: "proxy" } },
    goose("executing statement", { source: "00022_pair_number.sql", statement: "ALTER TABLE pairs ADD number INTEGER" }),
    { message: "Failed to apply migrations", level: "ERROR", timestamp: "08:40:23", data: { component: "db", error: "disk full" } },
  ]);

  assert.deepEqual(openingScreen(state).log, [
    "08:40:21 INFO Connecting to SQLite... component=db path=/Users/r/acme-portal.marasi",
    "08:40:21 INFO executing statement logger=goose source=00022_pair_number.sql statement=ALTER TABLE pairs ADD number INTEGER",
    "08:40:23 ERROR Failed to apply migrations component=db error=disk full",
  ]);
});

test("an open by bare name takes the project's path from the database it connects to", () => {
  const state = openingFor({ name: "new-target", path: null, current: { name: "scratchpad", path: null } });
  assert.equal(openingScreen(state).project.path, null);

  const connected = withOpenLog(state, db("Connecting to SQLite...", { path: "/cfg/Marasi/new-target.marasi" }));
  assert.deepEqual(openingScreen(connected).project, { name: "new-target", path: "/cfg/Marasi/new-target.marasi" });
});

test("an up-to-date database ticks Open and Upgrade even without a goose event first", () => {
  const state = replay(acme(), [db("Connecting to SQLite..."), db("Migrations up to date", { count: 0 })]);

  assert.deepEqual(marks(state), ["Lock:done", "Open:done", "Upgrade:done", "Loading:current"]);
});

// Errors as the app's Go side returns them through Wails.
const lockedError = "opening project: project_locked: project already open: /Users/r/acme-portal.marasi";

test("a locked project opened by bare name takes its path from the error", () => {
  const state = openingFor({ name: "acme-portal", path: null, current: { name: "scratchpad", path: null } });

  assert.deepEqual(openingScreen(withFailed(state, lockedError)).project, {
    name: "acme-portal",
    path: "/Users/r/acme-portal.marasi",
  });
});

test("a locked project fails the Lock step as Locked, says it's open in another Marasi, and offers Stay in and Try again", () => {
  const state = withFailed(acme(), lockedError);
  const screen = openingScreen(state);

  assert.deepEqual(marks(state), ["Locked:failed", "Open:todo", "Upgrade:todo", "Load:todo"]);
  assert.equal(screen.sentence, "Open in another Marasi.");
  assert.deepEqual(screen.failure, { kind: "locked", error: lockedError });
  assert.deepEqual(screen.actions, { stayIn: "scratchpad", tryAgain: true });
});

test("another failure fails the step that was running, offers Stay in but no Try again, and puts the raw error in the log", () => {
  const error = "file is not a database (26)";
  const state = withFailed(replay(acme(), [db("Connecting to SQLite...")]), error);
  const screen = openingScreen(state);

  assert.deepEqual(marks(state), ["Lock:done", "Open:failed", "Upgrade:todo", "Load:todo"]);
  assert.equal(screen.sentence, "Couldn't open the project.");
  assert.deepEqual(screen.failure, { kind: "other", error });
  assert.deepEqual(screen.actions, { stayIn: "scratchpad", tryAgain: false });
  assert.equal(screen.log.at(-1), error);
  assert.equal(screen.load.part, null);
});

test("a failed upgrade fails Upgrade, and stops showing upgrade progress", () => {
  const upgrading = replay(acme(), [db("Connecting to SQLite..."), goose("executing statement", { source: "00022_pair_number.sql" })]);
  const state = withFailed(upgrading, "opening project database: migrating: disk full");

  assert.deepEqual(marks(state), ["Lock:done", "Open:done", "Upgrade:failed", "Load:todo"]);
  assert.equal(openingScreen(state).upgrade, null);
});

// Recent projects as GetRecentProjects returns them: every project in the
// config dir, with Go's time.Time.String() as the date.
const cfg = "/Users/r/Library/Application Support/Marasi";
const recentProjects = [
  { ProjectName: `${cfg}/build.marasi`, Date: "2026-10-18 09:12:01.5 +0400 +04" },
  { ProjectName: `${cfg}/scratchpad.marasi`, Date: "2026-10-20 08:40:21.123456789 +0400 +04" },
  { ProjectName: `${cfg}/ai-sec.marasi`, Date: "2026-10-19 17:03:44.25 +0400 +04" },
  { ProjectName: `${cfg}/acme-portal.marasi`, Date: "2026-10-20 07:00:00 +0400 +04" },
  { ProjectName: `${cfg}/car.marasi`, Date: "2026-10-01 10:00:00.1 +0000 UTC" },
];
const names = (state) => openingScreen(state).choices.map((choice) => choice.name);

test("the recent projects to pick from leave out the target and the open project, most recent first", () => {
  const state = openingFor({
    name: "acme-portal",
    path: `${cfg}/acme-portal.marasi`,
    current: { name: "scratchpad", path: `${cfg}/scratchpad.marasi` },
  });
  const failed = withRecents(withFailed(state, lockedError), recentProjects);

  assert.deepEqual(names(failed), ["ai-sec", "build", "car"]);
  assert.equal(openingScreen(failed).choices[0].name, "ai-sec");
  assert.equal(openingScreen(failed).choices[0].path, `${cfg}/ai-sec.marasi`);
});

// The moment the opening screen lists recent projects: 08:40:21 at +04.
const now = Date.parse("2026-10-20T04:40:21Z");
const openedTimes = (state) => Object.fromEntries(openingScreen(state).choices.map((choice) => [choice.name, choice.opened]));

test("each recent project says when it was last opened", () => {
  const recents = [
    ...recentProjects,
    { ProjectName: `${cfg}/old.marasi`, Date: "2026-08-02 11:00:00 +0400 +04" },
    { ProjectName: `${cfg}/odd.marasi`, Date: "last Tuesday" },
  ];
  const state = withRecents(openingFor({ name: "target", path: `${cfg}/target.marasi` }), recents, now);

  assert.deepEqual(openedTimes(state), {
    scratchpad: "Just now",
    "acme-portal": "1 hour ago",
    "ai-sec": "15 hours ago",
    build: "Yesterday",
    car: "2 weeks ago",
    old: "2026-08-02",
    odd: "",
  });
});

test("a project opened a few minutes or days ago, or last week, says so", () => {
  const at = (date) => [{ ProjectName: `${cfg}/p.marasi`, Date: date }];
  const opened = (date) => openingScreen(withRecents(openingFor({ name: "target" }), at(date), now)).choices[0].opened;

  assert.equal(opened("2026-10-20 08:39:00 +0400 +04"), "1 minute ago");
  assert.equal(opened("2026-10-20 08:20:00 +0400 +04"), "20 minutes ago");
  assert.equal(opened("2026-10-17 08:00:00 +0400 +04"), "3 days ago");
  assert.equal(opened("2026-10-11 08:00:00 +0400 +04"), "Last week");
});

test("a target or open project with no known path is left out of the list by name", () => {
  const state = openingFor({ name: "acme-portal", path: null, current: { name: "scratchpad", path: null } });

  assert.deepEqual(names(withRecents(state, recentProjects)), ["ai-sec", "build", "car"]);
});

test("a project that shares the open project's name elsewhere stays in the list", () => {
  const state = openingFor({
    name: "acme-portal",
    path: `${cfg}/acme-portal.marasi`,
    current: { name: "build", path: "/Users/r/Engagements/build.marasi" },
  });

  assert.deepEqual(names(withRecents(state, recentProjects)), ["scratchpad", "ai-sec", "build", "car"]);
});

test("there's nothing to pick from until the recent projects arrive", () => {
  assert.deepEqual(openingScreen(withFailed(acme(), lockedError)).choices, []);
});

test("once the target's database is open the previous project is gone, so a failed load offers Stay in the target", () => {
  const loading = withSwitched(replay(acme(), upToDate));
  const state = withFailed(withLoadPart(loading, "extensions"), "loading extensions: boom");

  assert.deepEqual(marks(state), ["Lock:done", "Open:done", "Upgrade:done", "Load:failed"]);
  assert.deepEqual(openingScreen(state).actions, { stayIn: "acme-portal", tryAgain: false });
});

test("an open in progress has no failure and offers no actions", () => {
  assert.equal(openingScreen(acme()).failure, null);
  assert.equal(openingScreen(acme()).actions, null);
});

// At startup nothing is open yet, and the app opens the scratchpad first.
const scratchpad = () => openingFor({ name: "scratchpad", scratchpad: true });
const lockedScratchpad = `opening project: project_locked: project already open: ${cfg}/scratchpad.marasi`;

test("a locked scratchpad at startup says the scratchpad is open in another Marasi, offers Try again but no Stay in, and a project instead", () => {
  const state = withRecents(withFailed(scratchpad(), lockedScratchpad), recentProjects);
  const screen = openingScreen(state);

  assert.deepEqual(marks(state), ["Locked:failed", "Open:todo", "Upgrade:todo", "Load:todo"]);
  assert.equal(screen.sentence, "The scratchpad is open in another Marasi.");
  assert.deepEqual(screen.actions, { stayIn: null, tryAgain: true });
  assert.equal(screen.choicesLabel, "Open a project instead");
  assert.deepEqual(names(state), ["acme-portal", "ai-sec", "build", "car"]);
});

test("any other scratchpad failure at startup says it couldn't open, with the same list and neither Stay in nor Try again", () => {
  const state = withFailed(replay(scratchpad(), [db("Connecting to SQLite...")]), "file is not a database (26)");
  const screen = openingScreen(state);

  assert.equal(screen.sentence, "Couldn't open the project.");
  assert.deepEqual(screen.actions, { stayIn: null, tryAgain: false });
  assert.equal(screen.choicesLabel, "Open a project instead");
});

test("at startup, a project picked after a locked scratchpad is the one reported as opened, not the scratchpad", () => {
  const failed = withRecents(withFailed(scratchpad(), lockedScratchpad), recentProjects);
  const picked = openingScreen(failed).choices[0];
  assert.equal(openingScreen(failed).opened, null);

  // The picked project opens like any other, with nothing open before it.
  const opening = openingFor({ name: picked.name, path: picked.path });
  assert.equal(openingScreen(opening).opened, null);
  const state = withOpened(withSwitched(replay(opening, upToDate)));

  assert.deepEqual(openingScreen(state).opened, { name: "acme-portal", path: `${cfg}/acme-portal.marasi` });
});

test("with a project open, the list offers another project", () => {
  assert.equal(openingScreen(withFailed(acme(), lockedError)).choicesLabel, "Open another project");
});
