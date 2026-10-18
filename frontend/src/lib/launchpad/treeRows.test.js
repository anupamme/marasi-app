import { test } from "node:test";
import assert from "node:assert/strict";
import { entryRows, launchpadSummary, searchLaunchpads, statusKey } from "./treeRows.js";

const launchpad = { ID: "lp", Name: "Login", Description: "" };
const makeEntries = (n, status = () => 200) =>
  Array.from({ length: n }, (_, i) => ({ ID: `e${i + 1}`, StatusCode: status(i) }));
const describe = (rows) =>
  rows.map((row) =>
    row.kind === "entry"
      ? `#${row.index + 1}`
      : row.kind === "more"
        ? `more:${row.hidden}`
        : `group:${row.key}:${row.count}${row.open ? ":open" : ""}`,
  );

test("a long launchpad shows an earlier-entries row, then its last 10 in entry order", () => {
  const rows = entryRows({ launchpad, entries: makeEntries(25) });
  assert.deepEqual(describe(rows), [
    "more:15",
    "#16", "#17", "#18", "#19", "#20", "#21", "#22", "#23", "#24", "#25",
  ]);
});

test("rows are numbered by position in entry order, not by pair number", () => {
  const entries = [{ ID: "x", Number: 42 }, { ID: "y", Number: 7 }, { ID: "z", Number: 19 }];
  const rows = entryRows({ launchpad, entries });
  assert.deepEqual(rows.map((row) => [row.entry.Number, `#${row.index + 1}`]), [[42, "#1"], [7, "#2"], [19, "#3"]]);
  assert.equal(rows.at(-1).last, true);
});

test("a launchpad with 10 entries or fewer has no earlier-entries row", () => {
  const rows = describe(entryRows({ launchpad, entries: makeEntries(10) }));
  assert.equal(rows.length, 10);
  assert.ok(!rows.some((row) => row.startsWith("more")));
  assert.deepEqual(describe(entryRows({ launchpad, entries: makeEntries(11) })).slice(0, 2), ["more:1", "#2"]);
  assert.deepEqual(entryRows({ launchpad, entries: [] }), []);
});

test("showing more entries widens the window and shrinks the earlier row", () => {
  const rows = entryRows({ launchpad, entries: makeEntries(100), shownByList: { lp: 60 } });
  assert.deepEqual(describe(rows).slice(0, 2), ["more:40", "#41"]);
  assert.equal(rows.length, 61);
  assert.equal(rows[0].total, 100);
});

// 200, 200, 404, 200, pending (0), 500, 404.
const mixed = [200, 200, 404, 200, 0, 500, 404].map((code, i) => ({ ID: `e${i + 1}`, StatusCode: code }));

test("grouping by status files every entry into numeric status folders, pending last", () => {
  const rows = entryRows({ launchpad, entries: mixed, groupByStatus: true });
  assert.deepEqual(describe(rows), ["group:200:3", "group:404:2", "group:500:1", "group:pending:1"]);
});

test("the folder holding the selected entry opens by itself", () => {
  const rows = entryRows({ launchpad, entries: mixed, groupByStatus: true, selectedEntryId: "e3" });
  assert.deepEqual(describe(rows), ["group:200:3", "group:404:2:open", "#3", "#7", "group:500:1", "group:pending:1"]);
  assert.equal(rows[2].depth, 2);
  assert.equal(rows[2].list, "lp:404");
});

test("an explicitly toggled folder overrides the selection", () => {
  const rows = entryRows({
    launchpad, entries: mixed, groupByStatus: true, selectedEntryId: "e3",
    openGroups: { "lp:404": false, "lp:500": true },
  });
  assert.deepEqual(describe(rows), ["group:200:3", "group:404:2", "group:500:1:open", "#6", "group:pending:1"]);
});

test("each status folder is windowed like a launchpad", () => {
  const entries = makeEntries(30, () => 302);
  const rows = entryRows({ launchpad, entries, groupByStatus: true, openGroups: { "lp:302": true } });
  assert.deepEqual(describe(rows).slice(0, 3), ["group:302:30:open", "more:20", "#21"]);
  const more = entryRows({ launchpad, entries, groupByStatus: true, openGroups: { "lp:302": true }, shownByList: { "lp:302": 30 } });
  assert.deepEqual(describe(more).slice(0, 2), ["group:302:30:open", "#1"]);
});

test("the final entry of each list is marked last, for the End-of button", () => {
  const flat = entryRows({ launchpad, entries: makeEntries(5) });
  assert.deepEqual(flat.filter((row) => row.last).map((row) => row.entry.ID), ["e5"]);
  const grouped = entryRows({
    launchpad, entries: mixed, groupByStatus: true, openGroups: { "lp:200": true, "lp:404": true },
  });
  assert.deepEqual(grouped.filter((row) => row.last).map((row) => [row.list, row.entry.ID]), [
    ["lp:200", "e4"], ["lp:404", "e7"],
  ]);
});

test("search matches show only the matched entries, flat and unwindowed", () => {
  const rows = entryRows({ launchpad, entries: makeEntries(40), matchedEntries: [{ ID: "e2" }, { ID: "e39" }], groupByStatus: true });
  assert.deepEqual(describe(rows), ["#2", "#39"]);
});

test("the window widens to show a selected entry from earlier in the list", () => {
  const rows = entryRows({ launchpad, entries: makeEntries(25), selectedEntryId: "e5" });
  assert.deepEqual(describe(rows).slice(0, 3), ["more:4", "#5", "#6"]);
  assert.equal(rows.length, 22);
});

test("a status folder's window widens to show its selected entry", () => {
  const entries = makeEntries(30, () => 302);
  const rows = entryRows({ launchpad, entries, groupByStatus: true, selectedEntryId: "e3" });
  assert.deepEqual(describe(rows).slice(0, 4), ["group:302:30:open", "more:2", "#3", "#4"]);
});

test("showing all entries removes the earlier row", () => {
  const rows = entryRows({ launchpad, entries: makeEntries(100), shownByList: { lp: 100 } });
  assert.deepEqual(describe(rows).slice(0, 2), ["#1", "#2"]);
});

const state = (search, entryMatches = null) => ({
  search,
  launchpads: [
    { ID: "a", Name: "Login flow", Description: "auth checks" },
    { ID: "b", Name: "Orders", Description: "" },
    { ID: "c", Name: "Search", Description: "" },
  ],
  entriesByLaunchpad: {
    a: [{ ID: "a1", Method: "POST", Host: "x.test", Path: "/login" }],
    b: [
      { ID: "b1", Method: "GET", Host: "x.test", Path: "/orders/1" },
      { ID: "b2", Method: "DELETE", Host: "x.test", Path: "/orders/2" },
    ],
  },
  selectedLaunchpadId: "b",
  entrySearch: { matches: entryMatches },
});

test("without a search every launchpad is listed with all its entries", () => {
  const results = searchLaunchpads(state("  "));
  assert.deepEqual(
    results.map((r) => [r.launchpad.ID, r.entries.length, r.matchedEntries]),
    [["a", 1, null], ["b", 2, null], ["c", 0, null]],
  );
});

test("a name or description match lists the whole launchpad", () => {
  assert.deepEqual(searchLaunchpads(state("AUTH")).map((r) => [r.launchpad.ID, r.matchedEntries]), [["a", null]]);
});

test("entry matches come from Marasi's search, across every launchpad", () => {
  const results = searchLaunchpads(state("secret", { a: ["a1"], b: ["b2"] }));
  assert.deepEqual(
    results.map((r) => [r.launchpad.ID, r.matchedEntries.map((e) => e.ID), r.matchCount]),
    [["a", ["a1"], 1], ["b", ["b2"], 1]],
  );
});

test("entry text is not matched locally; without Marasi's matches nothing is listed", () => {
  assert.deepEqual(searchLaunchpads(state("delete")), []);
});

test("a launchpad whose entries have not loaded still lists its match count", () => {
  const results = searchLaunchpads(state("secret", { c: ["c7", "c9"] }));
  assert.deepEqual(
    results.map((r) => [r.launchpad.ID, r.matchedEntries, r.matchCount]),
    [["c", [], 2]],
  );
});

test("a name match wins over entry matches in the same launchpad", () => {
  const results = searchLaunchpads(state("login", { a: ["a1"] }));
  assert.deepEqual(results.map((r) => [r.launchpad.ID, r.matchedEntries]), [["a", null]]);
});

test("a launchpad summary comes from its entry count and last status code", () => {
  assert.deepEqual(launchpadSummary({ EntryCount: 2, LastStatusCode: 404 }), { count: 2, lastStatus: 404 });
  // The newest entry has no response yet.
  assert.deepEqual(launchpadSummary({ EntryCount: 2, LastStatusCode: null }), { count: 2, lastStatus: 0 });
  assert.deepEqual(launchpadSummary({ EntryCount: 0, LastStatusCode: null }), { count: 0, lastStatus: null });
  assert.deepEqual(launchpadSummary({ ID: "x" }), { count: null, lastStatus: null });
});

test("statusKey files an unanswered entry by its launch outcome, not as pending", () => {
  const unanswered = { ID: "e", StatusCode: 0 };
  assert.equal(statusKey(unanswered, { Status: "cancelled" }), "cancelled");
  assert.equal(statusKey(unanswered, { Status: "failed", Reason: "network_error" }), "failed");
  assert.equal(statusKey(unanswered, { Status: "pending" }), "pending");
  assert.equal(statusKey(unanswered, null), "pending");
  // The stored outcome counts when no live launch is known.
  assert.equal(statusKey({ ...unanswered, Metadata: { launch: { status: "cancelled" } } }), "cancelled");
  // A response code wins: a failed launch stored as 502 files under 502.
  assert.equal(statusKey({ ID: "f", StatusCode: 502 }, { Status: "failed" }), "502");
});

test("grouped rows put a cancelled launch in a cancelled folder after the code folders", () => {
  const launchpad = { ID: "lp", Name: "Pad" };
  const entries = [
    { ID: "a", StatusCode: 200 },
    { ID: "b", StatusCode: 200 },
    { ID: "c", StatusCode: 0 },
    { ID: "d", StatusCode: 0 },
  ];
  const launches = { c: { Status: "cancelled" }, d: { Status: "pending" } };
  const rows = entryRows({
    launchpad,
    entries,
    groupByStatus: true,
    launchFor: (entry) => launches[entry.ID] ?? null,
  });
  const folders = rows.filter((row) => row.kind === "group").map((row) => row.key);
  assert.deepEqual(folders, ["200", "pending", "cancelled"]);
});
