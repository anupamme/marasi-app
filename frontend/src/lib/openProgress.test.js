import { test } from "node:test";
import assert from "node:assert/strict";
import { openingFor, openingScreen, withLoadPart, withOpened, withOpenLog } from "./openProgress.js";

// The opening screen's steps as "label:mark" pairs, for compact assertions.
const marks = (state) => openingScreen(state).steps.map((step) => `${step.label}:${step.mark}`);

// Log events as the app's slog relay emits them while a project opens.
const db = (message, data = {}) => ({ message, level: "INFO", timestamp: "08:40:21", data: { component: "db", ...data } });
const goose = (message, data = {}) => ({ message, level: "INFO", timestamp: "08:40:21", data: { logger: "goose", ...data } });

const replay = (state, events) => events.reduce(withOpenLog, state);
const acme = () => openingFor({ name: "acme-portal", path: "/Users/r/acme-portal.marasi", currentProject: "scratchpad" });

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
  const state = openingFor({ name: "new-target", path: null, currentProject: "scratchpad" });
  assert.equal(openingScreen(state).project.path, null);

  const connected = withOpenLog(state, db("Connecting to SQLite...", { path: "/cfg/Marasi/new-target.marasi" }));
  assert.deepEqual(openingScreen(connected).project, { name: "new-target", path: "/cfg/Marasi/new-target.marasi" });
});

test("an up-to-date database ticks Open and Upgrade even without a goose event first", () => {
  const state = replay(acme(), [db("Connecting to SQLite..."), db("Migrations up to date", { count: 0 })]);

  assert.deepEqual(marks(state), ["Lock:done", "Open:done", "Upgrade:done", "Loading:current"]);
});
