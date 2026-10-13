import { test } from "node:test";
import assert from "node:assert/strict";
import { entryRows, launchpadSummary, searchLaunchpads } from "./treeRows.js";

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

test("a long launchpad shows its original entry, an earlier-entries row, then the last 10", () => {
  const rows = entryRows({ launchpad, entries: makeEntries(25) });
  assert.deepEqual(describe(rows), [
    "#1", "more:14",
    "#16", "#17", "#18", "#19", "#20", "#21", "#22", "#23", "#24", "#25",
  ]);
});

test("a launchpad with 11 entries or fewer has no earlier-entries row", () => {
  const rows = describe(entryRows({ launchpad, entries: makeEntries(11) }));
  assert.equal(rows.length, 11);
  assert.ok(!rows.some((row) => row.startsWith("more")));
  assert.deepEqual(entryRows({ launchpad, entries: [] }), []);
});

test("showing more entries widens the window and shrinks the earlier row", () => {
  const rows = entryRows({ launchpad, entries: makeEntries(100), shownByList: { lp: 60 } });
  assert.deepEqual(describe(rows).slice(0, 3), ["#1", "more:39", "#41"]);
  assert.equal(rows.length, 62);
  assert.equal(rows[1].total, 99);
});

// #1 is the original; then 200, 404, 200, pending (0), 500, 404.
const mixed = [200, 200, 404, 200, 0, 500, 404].map((code, i) => ({ ID: `e${i + 1}`, StatusCode: code }));

test("grouping by status files entries after the original into numeric status folders, pending last", () => {
  const rows = entryRows({ launchpad, entries: mixed, groupByStatus: true });
  assert.deepEqual(describe(rows), ["#1", "group:200:2", "group:404:2", "group:500:1", "group:pending:1"]);
});

test("the folder holding the selected entry opens by itself", () => {
  const rows = entryRows({ launchpad, entries: mixed, groupByStatus: true, selectedEntryId: "e3" });
  assert.deepEqual(describe(rows), ["#1", "group:200:2", "group:404:2:open", "#3", "#7", "group:500:1", "group:pending:1"]);
  assert.equal(rows[3].depth, 2);
  assert.equal(rows[3].list, "lp:404");
});

test("an explicitly toggled folder overrides the selection", () => {
  const rows = entryRows({
    launchpad, entries: mixed, groupByStatus: true, selectedEntryId: "e3",
    openGroups: { "lp:404": false, "lp:500": true },
  });
  assert.deepEqual(describe(rows), ["#1", "group:200:2", "group:404:2", "group:500:1:open", "#6", "group:pending:1"]);
});

test("each status folder is windowed like a launchpad", () => {
  const entries = makeEntries(30, () => 302);
  const rows = entryRows({ launchpad, entries, groupByStatus: true, openGroups: { "lp:302": true } });
  assert.deepEqual(describe(rows).slice(0, 4), ["#1", "group:302:29:open", "more:19", "#21"]);
  const more = entryRows({ launchpad, entries, groupByStatus: true, openGroups: { "lp:302": true }, shownByList: { "lp:302": 29 } });
  assert.deepEqual(describe(more).slice(0, 3), ["#1", "group:302:29:open", "#2"]);
});

test("the final entry of each list is marked last, for the Latest-in button", () => {
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
  assert.deepEqual(describe(rows).slice(0, 4), ["#1", "more:3", "#5", "#6"]);
  assert.equal(rows.length, 23);
});

test("a status folder's window widens to show its selected entry", () => {
  const entries = makeEntries(30, () => 302);
  const rows = entryRows({ launchpad, entries, groupByStatus: true, selectedEntryId: "e3" });
  assert.deepEqual(describe(rows).slice(0, 5), ["#1", "group:302:29:open", "more:1", "#3", "#4"]);
});

test("showing all entries removes the earlier row", () => {
  const rows = entryRows({ launchpad, entries: makeEntries(100), shownByList: { lp: 99 } });
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
