import { test } from "node:test";
import assert from "node:assert/strict";
import {
  curlCommand,
  filterMenu,
  markdownTable,
  menuFor,
  narrowQuery,
  pairURL,
  selectionSummary,
  similarIDs,
} from "./rowMenu.js";
import { effectivePalette } from "./highlights.js";

const pair = (id, extra = {}) => ({
  ID: id,
  Scheme: "https",
  Host: "api.acme.test",
  Method: "GET",
  Path: `/v1/users/${id}`,
  StatusCode: 200,
  ContentType: "application/json",
  Metadata: {},
  ...extra,
});

const numbers = { a: 1, b: 2, c: 3, d: 4 };
const context = (extra = {}) => ({
  numberOf: (p) => numbers[p.ID],
  launchpads: [{ ID: "L1", Name: "Login" }],
  findings: [
    { ID: "F1", Title: "IDOR", Severity: "High", Requests: ["a", "b"] },
    { ID: "F2", Title: "XSS", Severity: "Low", Requests: ["a"] },
    { ID: "F3", Title: "CSRF", Severity: "Medium", Requests: [] },
  ],
  testCases: [{ ID: "T1", Title: "Auth", Requests: [] }],
  ...extra,
});

const item = (items, id) => {
  for (const it of items) {
    if (it?.id === id) return it;
    // ("sep".sub is String.prototype.sub.)
    const found = Array.isArray(it?.sub) && item(it.sub, id);
    if (found) return found;
  }
  return undefined;
};
const ids = (items) => items.filter((it) => it?.id).map((it) => it.id);

test("one pair: open, Launchpad, Armory, Finding, Test case, Note, Highlight, Copy, Narrow, Select, Metadata, Delete", () => {
  const menu = menuFor([pair("a")], context());
  assert.deepEqual(ids(menu), [
    "open",
    "launchpad",
    "armory",
    "finding",
    "testcase",
    "note",
    "highlight",
    "copy",
    "narrow",
    "select",
    "metadata",
    "delete",
  ]);
  assert.equal(item(menu, "open").label, "Open in drawer");
  assert.equal(item(menu, "note").label, "Add note…");
  assert.equal(item(menu, "metadata").disabled, false);
  assert.equal(item(menu, "lp-each"), undefined, "one each needs several pairs");
});

test("a WebSocket upgrade row offers its stream", () => {
  const ws = pair("a", { StatusCode: 101, Metadata: { protocol: "websocket" } });
  assert.deepEqual(ids(menuFor([ws], context())).slice(0, 2), ["open", "websocket"]);
  assert.equal(item(menuFor([ws, pair("b")], context()), "websocket"), undefined);
});

test("several pairs: counts in the labels, bulk notes, metadata disabled", () => {
  const menu = menuFor([pair("a"), pair("b")], context());
  assert.equal(item(menu, "open").label, "Open request 1 in drawer");
  assert.equal(item(menu, "lp-new").label, "New launchpad with 2 entries");
  assert.equal(item(menu, "lp-each").label, "2 launchpads, one each");
  assert.equal(item(menu, "armory").label, "Send 2 to Armory");
  assert.deepEqual(ids(item(menu, "note").sub), ["n-append", "n-clear"]);
  assert.equal(item(menu, "metadata").disabled, true);
  assert.equal(item(menu, "c-url").label, "2 URLs");
});

test("one launchpad each is disabled past 25 pairs", () => {
  const many = Array.from({ length: 26 }, (_, i) => pair(`p${i}`));
  assert.equal(item(menuFor(many, context()), "lp-each").disabled, true);
  assert.equal(item(menuFor(many.slice(0, 25), context()), "lp-each").disabled, false);
});

test("findings show checked when every pair is linked, mixed when some are, and unlink the linked ones", () => {
  const menu = menuFor([pair("a"), pair("b")], context());
  assert.equal(item(menu, "f-F1").checked, true);
  assert.equal(item(menu, "f-F2").checked, "mixed");
  assert.equal(item(menu, "f-F3").checked, false);
  assert.deepEqual(item(menu, "f-F1").action, { type: "link-finding", id: "F1", title: "IDOR" });
  assert.deepEqual(
    ids(item(menu, "finding").sub).filter((id) => id.startsWith("fu-")),
    ["fu-F1", "fu-F2"],
  );
  assert.equal(item(menu, "finding").badge, 2);
  assert.equal(item(menu, "testcase").badge, null);
});

test("with no launchpads, findings or test cases, the submenus say so", () => {
  const menu = menuFor([pair("a")], context({ launchpads: [], findings: [], testCases: [] }));
  assert.equal(item(menu, "lp-none").disabled, true);
  assert.equal(item(menu, "f-none").disabled, true);
  assert.equal(item(menu, "t-none").disabled, true);
});

test("copying raw responses is disabled until a pair has one", () => {
  const pending = pair("a", { StatusCode: 0 });
  assert.equal(item(menuFor([pending], context()), "c-res").disabled, true);
  assert.equal(item(menuFor([pending, pair("b")], context()), "c-res").disabled, false);
});

test("narrowing offers the host, other hosts, the path's folder, the status and hiding the type", () => {
  const menu = menuFor([pair("a", { Path: "/v1/users/7?x=1" })], context());
  const narrow = item(menu, "narrow").sub.filter((it) => it.action);
  assert.deepEqual(
    narrow.map((it) => it.action),
    [
      { type: "narrow", term: 'host = "api.acme.test"' },
      { type: "narrow", term: 'host != "api.acme.test"' },
      { type: "narrow", term: 'path = "/v1/users/*"' },
      { type: "narrow", term: "status_code = 200" },
      { type: "hide-type", contentType: "application/json" },
    ],
  );
  const two = menuFor([pair("a"), pair("b", { Host: "cdn.acme.test", StatusCode: 404 })], context());
  assert.deepEqual(item(two, "q-host").action, {
    type: "narrow",
    term: '(host = "api.acme.test" OR host = "cdn.acme.test")',
  });
  assert.equal(item(two, "q-status"), undefined, "statuses differ");
});

test("the header sums up hosts, methods and status classes", () => {
  const summary = selectionSummary([
    pair("a"),
    pair("b", { Method: "POST", StatusCode: 500 }),
    pair("c", { Host: "cdn.acme.test", StatusCode: 0 }),
  ]);
  assert.deepEqual(summary, {
    count: 3,
    hosts: ["api.acme.test", "cdn.acme.test"],
    methods: [
      ["GET", 2],
      ["POST", 1],
    ],
    classes: [
      ["2xx", 1],
      ["5xx", 1],
    ],
  });
});

test("type-to-filter searches every action, submenus included, and shows where each lives", () => {
  const found = filterMenu(menuFor([pair("a")], context()), "curl");
  assert.deepEqual(
    found.map((it) => [it.trail, it.label]),
    [[["Copy"], "As cURL"]],
  );
  assert.ok(filterMenu(menuFor([pair("a")], context()), "idor").some((it) => it.id === "f-F1"));
  assert.ok(filterMenu(menuFor([pair("a")], context()), "launchpad").length >= 2);
});

test("the highlight swatches: 8 labelled from the palette, then None, marking the pairs' own", () => {
  const palette = effectivePalette([], { 3: "IDOR candidate" });
  const menu = menuFor([pair("a", { Highlight: 3 }), pair("b", { Highlight: 3 })], context({ palette }));
  const swatches = item(menu, "highlight").swatches;
  assert.deepEqual(
    swatches.map((s) => [s.label, s.color, s.checked]),
    [
      ["Red", "#ef4444", false],
      ["Orange", "#f97316", false],
      ["IDOR candidate", "#eab308", true],
      ["Green", "#22c55e", false],
      ["Cyan", "#06b6d4", false],
      ["Blue", "#3b82f6", false],
      ["Purple", "#a855f7", false],
      ["Pink", "#ec4899", false],
      ["None", null, false],
    ],
  );
  assert.deepEqual(swatches[2].action, { type: "highlight", number: 3 });
  assert.deepEqual(swatches[8].action, { type: "highlight", number: null });
});

test("a swatch some of the pairs have is mixed; None is checked when none have one", () => {
  const palette = effectivePalette([]);
  const mixed = item(menuFor([pair("a", { Highlight: 5 }), pair("b")], context({ palette })), "highlight");
  assert.equal(mixed.swatches[4].checked, "mixed");
  assert.equal(mixed.swatches[8].checked, "mixed");
  const plain = item(menuFor([pair("a")], context({ palette })), "highlight");
  assert.equal(plain.swatches[8].checked, true);
});

test("type-to-filter finds a swatch by its label", () => {
  const palette = effectivePalette([], { 3: "IDOR candidate" });
  const found = filterMenu(menuFor([pair("a")], context({ palette })), "idor cand");
  assert.deepEqual(
    found.map((it) => [it.trail, it.label, it.color]),
    [[["Highlight"], "IDOR candidate", "#eab308"]],
  );
});

test("narrowing appends a term; a query with OR is grouped first", () => {
  assert.equal(narrowQuery("", 'host = "x"'), 'host = "x"');
  assert.equal(narrowQuery("method = \"GET\" ", 'host = "x"'), 'method = "GET" AND host = "x"');
  assert.equal(
    narrowQuery('status_code = 500 OR status_code = 502', 'host = "x"'),
    '(status_code = 500 OR status_code = 502) AND host = "x"',
  );
});

test("Select finds the loaded rows like the selection", () => {
  const rows = [
    pair("a"),
    pair("b", { Host: "cdn.acme.test", StatusCode: 404 }),
    pair("c", { Path: "/v1/users/a" }),
    pair("d", { Highlight: 3 }),
  ];
  const chosen = [rows[0]];
  assert.deepEqual(similarIDs("host", rows, chosen), ["a", "c", "d"]);
  assert.deepEqual(similarIDs("endpoint", rows, chosen), ["a", "c"]);
  assert.deepEqual(similarIDs("status", rows, [rows[1]]), ["b"]);
  assert.deepEqual(similarIDs("highlight", rows, [rows[3]]), ["d"]);
  assert.deepEqual(similarIDs("invert", rows, chosen), ["b", "c", "d"]);
});

test("copy formats: URL, Markdown table and cURL", () => {
  assert.equal(pairURL(pair("a")), "https://api.acme.test/v1/users/a");
  assert.equal(
    markdownTable([pair("a"), pair("b", { StatusCode: 0 })], (p) => numbers[p.ID]),
    [
      "| # | Method | URL | Status |",
      "|---|---|---|---|",
      "| 1 | GET | https://api.acme.test/v1/users/a | 200 |",
      "| 2 | GET | https://api.acme.test/v1/users/b | — |",
    ].join("\n"),
  );
  const raw = "POST /login HTTP/1.1\r\nHost: api.acme.test\r\nContent-Type: application/json\r\n\r\n{\"u\":\"it's\"}";
  assert.equal(
    curlCommand(pair("a", { Method: "POST", Path: "/login" }), raw),
    [
      "curl -X POST 'https://api.acme.test/login'",
      "  -H 'Content-Type: application/json'",
      "  --data-raw '{\"u\":\"it'\\''s\"}'",
    ].join(" \\\n"),
  );
});

test("Note: one pair adds or edits it; several append a note or clear them", () => {
  const menu = menuFor([pair("a"), pair("b")], context());
  assert.equal(item(menu, "note").label, "Note");
  assert.equal(item(menu, "n-append").label, "Append a note…");
  assert.deepEqual(item(menu, "n-append").action, { type: "append-note" });
  assert.equal(item(menu, "n-clear").label, "Clear notes…");
  assert.deepEqual(item(menu, "n-clear").action, { type: "clear-notes" });
  assert.equal(item(menu, "n-clear").danger, true);
  assert.equal(item(menuFor([pair("a", { Metadata: { has_note: 1 } })], context()), "note").label, "Edit note…");
});

test("Remove from launchpad lists the launchpads", () => {
  const menu = menuFor([pair("a")], context({ launchpads: [{ ID: "L1", Name: "Login" }, { ID: "L2", Name: "" }] }));
  const sub = item(menu, "launchpad").sub;
  assert.ok(sub.some((it) => it.heading === "Remove from launchpad"));
  assert.deepEqual(item(menu, "lpu-L1").action, { type: "remove-from-launchpad", id: "L1", name: "Login" });
  assert.equal(item(menu, "lpu-L2").label, "Untitled launchpad");
  const none = menuFor([pair("a")], context({ launchpads: [] }));
  assert.equal(item(none, "launchpad").sub.some((it) => it.heading === "Remove from launchpad"), false);
});

test("Delete from project comes last and names the count", () => {
  const one = menuFor([pair("a")], context());
  assert.equal(ids(one).at(-1), "delete");
  assert.equal(item(one, "delete").label, "Delete from project…");
  assert.deepEqual(item(one, "delete").action, { type: "delete" });
  assert.equal(item(one, "delete").danger, true);
  assert.equal(item(menuFor([pair("a"), pair("b")], context()), "delete").label, "Delete 2 from project…");
});

test("a ⌘A selection names its count, and actions that need each pair wait for them all", () => {
  const menu = menuFor([pair("a"), pair("b")], context({ all: true, count: 1200 }));
  assert.equal(item(menu, "lp-new").label, "New launchpad with 1,200 entries");
  assert.equal(item(menu, "delete").label, "Delete 1,200 from project…");
  assert.equal(item(menu, "lp-each").disabled, true);
  assert.equal(item(menu, "armory").disabled, true);
  assert.equal(item(menu, "copy").disabled, true);
  assert.equal(item(menu, "f-new").disabled, true);
  assert.equal(item(menu, "t-new").disabled, true);
  assert.equal(item(menu, "lp-L1").disabled, undefined, "bulk links still run");
  assert.equal(item(menu, "f-F3").checked, undefined, "link states are unknown");
  assert.deepEqual(
    ids(item(menu, "finding").sub).filter((id) => id.startsWith("fu-")),
    ["fu-F1", "fu-F2", "fu-F3"],
    "any finding can be unlinked",
  );
  assert.ok(item(menu, "highlight").swatches.every((swatch) => swatch.checked === undefined));

  const counting = menuFor([pair("a"), pair("b")], context({ all: true, count: null }));
  assert.equal(item(counting, "lp-new").label, "New launchpad with all entries");

  const loaded = menuFor([pair("a"), pair("b")], context({ all: true, count: 2 }));
  assert.equal(item(loaded, "armory").disabled, false, "every pair is loaded");
  assert.equal(item(loaded, "f-F1").checked, true);
});
