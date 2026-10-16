import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEDGER_COLUMNS,
  badgeSlots,
  formatSize,
  keepRowInPlace,
  rowBadges,
  rowHighlight,
  rowTemplate,
  scrollToReveal,
  shortType,
  DEFAULT_SORT,
  meetsHeader,
  sortAria,
  sortMark,
  sortTitle,
  statusText,
  visibleRange,
} from "./table.js";
import { effectivePalette } from "./highlights.js";

test("the table's columns are # · badges · Time · Method · Host · Path · Status · Type · Size", () => {
  assert.deepEqual(
    LEDGER_COLUMNS.map((column) => column.label),
    ["#", "", "Time", "Method", "Host", "Path", "Status", "Type", "Size"],
  );
  assert.deepEqual(
    LEDGER_COLUMNS.filter((column) => column.align === "right").map((column) => column.label),
    ["#", "Status", "Size"],
  );
});

test("every column but the badges sorts by a Marasi field; # by the pair number", () => {
  assert.deepEqual(
    Object.fromEntries(LEDGER_COLUMNS.map((column) => [column.label, column.sort ?? null])),
    {
      "#": "number",
      "": null,
      Time: "requested_at",
      Method: "method",
      Host: "host",
      Path: "path",
      Status: "status_code",
      Type: "content_type",
      Size: "length",
    },
  );
});

test("a sorted column's header shows its direction", () => {
  const host = LEDGER_COLUMNS.find((column) => column.label === "Host");
  const time = LEDGER_COLUMNS.find((column) => column.label === "Time");
  assert.equal(sortMark({ field: "host", desc: false }, host), "↑");
  assert.equal(sortMark({ field: "host", desc: true }, host), "↓");
  assert.equal(sortMark({ field: "host", desc: true }, time), "");
});

test("the default sort, newest first by number, shows no arrow but still reports its order", () => {
  const number = LEDGER_COLUMNS.find((column) => column.label === "#");
  const time = LEDGER_COLUMNS.find((column) => column.label === "Time");
  assert.deepEqual(DEFAULT_SORT, { field: "number", desc: true });
  assert.equal(sortMark(DEFAULT_SORT, number), "");
  assert.equal(sortAria(DEFAULT_SORT, number), "descending");
  assert.equal(sortTitle(DEFAULT_SORT, number), "Newest first · click for oldest first");
  assert.equal(sortMark({ field: "number", desc: false }, number), "↑", "oldest first is a change");
  assert.equal(sortAria({ field: "number", desc: false }, number), "ascending");
  assert.equal(sortTitle({ field: "number", desc: false }, number), "Sort by number");
  assert.equal(sortMark({ field: "requested_at", desc: true }, time), "↓", "time newest first is not the default");
  assert.equal(sortAria(DEFAULT_SORT, time), "none");
});

test("a row meets the header when it is first, or scrolled to sit right under it", () => {
  assert.equal(meetsHeader(0, 0, 22), true);
  assert.equal(meetsHeader(1, 0, 22), false);
  assert.equal(meetsHeader(3, 66, 22), true);
  assert.equal(meetsHeader(3, 66.4, 22), true, "sub-pixel scrolling still counts");
  assert.equal(meetsHeader(3, 70, 22), false, "partly under the header: its top edge is hidden anyway");
});

test("when rows change around it, the top row in view keeps its place", () => {
  const rows = (...ids) => ids.map((ID) => ({ ID }));
  // Two pages were prepended above row c, which sat at the top, 5px in.
  assert.equal(keepRowInPlace({ anchorID: "c", offset: 5, rows: rows("x", "y", "a", "b", "c"), rowHeight: 22 }), 4 * 22 + 5);
  // A row that's gone leaves the scroll where it was.
  assert.equal(keepRowInPlace({ anchorID: "z", offset: 5, rows: rows("a"), rowHeight: 22 }), null);
  assert.equal(keepRowInPlace({ anchorID: null, offset: 0, rows: rows("a"), rowHeight: 22 }), null);
});

// Method fits OPTIONS and its label with the sort arrow; Type fits most
// subtypes (x-protobuf, javascript) and its tooltip shows the rest.
test("every row lays its cells out on the same grid; the path takes the spare width", () => {
  assert.equal(
    rowTemplate(LEDGER_COLUMNS),
    "52px 46px 70px 80px 170px minmax(180px,1fr) 60px 120px 62px",
  );
});

test("Type shows a short name for the content type", () => {
  assert.equal(shortType("application/json; charset=utf-8"), "json");
  assert.equal(shortType("application/javascript"), "js");
  assert.equal(shortType("image/svg+xml"), "svg+xml");
  assert.equal(shortType("text/plain"), "text");
  assert.equal(shortType(""), "");
  assert.equal(shortType(undefined), "");
});

test("Size reads bytes, then KB and MB; an empty or zero length is blank", () => {
  assert.equal(formatSize("512"), "512 B");
  assert.equal(formatSize("2048"), "2.0 KB");
  assert.equal(formatSize(20480), "20 KB");
  assert.equal(formatSize("3145728"), "3.0 MB");
  assert.equal(formatSize("0"), "");
  assert.equal(formatSize(""), "");
});

const keys = (badges) => badges.map((badge) => badge.key);

test("a plain pair has no badges", () => {
  assert.deepEqual(rowBadges({ Metadata: {} }), []);
  assert.deepEqual(rowBadges({}), []);
});

test("badges mark the WebSocket upgrade, launchpads, Armory, interception, edits, notes and host overrides", () => {
  const row = {
    StatusCode: 101,
    Metadata: {
      protocol: "websocket",
      "websocket.state": "open",
      launchpad: "1",
      armory_run_id: "r",
      intercepted: true,
      "original-request": "GET / HTTP/1.1",
      "original-response": "HTTP/1.1 200 OK",
      has_note: 1,
      override_host: "example.test",
    },
  };
  assert.deepEqual(keys(rowBadges(row)), [
    "websocket",
    "launchpad",
    "armory",
    "intercepted",
    "edited-request",
    "edited-response",
    "note",
    "override-host",
  ]);
  for (const badge of rowBadges(row)) assert.ok(badge.label, `${badge.key} has a label`);
});

test("a failed upgrade's badge is slashed and says why", () => {
  const [badge] = rowBadges({ Metadata: { protocol: "websocket", "websocket.state": "failed" } });
  assert.equal(badge.key, "websocket");
  assert.equal(badge.slashed, true);
  assert.match(badge.label, /handshake failed/);
});

test("an intercepted pair that wasn't edited shows no edit badges", () => {
  assert.deepEqual(keys(rowBadges({ Metadata: { intercepted: true } })), ["intercepted"]);
});

test("up to three badges show; past three, the third slot reads +N for the rest", () => {
  const badges = ["a", "b", "c", "d", "e"].map((key) => ({ key, label: key }));
  assert.deepEqual(badgeSlots(badges.slice(0, 3)), { visible: badges.slice(0, 3), more: 0 });
  assert.deepEqual(badgeSlots(badges), { visible: badges.slice(0, 2), more: 3 });
  assert.deepEqual(badgeSlots(badges.slice(0, 4)), { visible: badges.slice(0, 2), more: 2 });
});

test("the windowed list renders only the rows in view, plus a margin either side", () => {
  // 10,000 rows of 22px in a 440px viewport scrolled to row 1,000.
  assert.deepEqual(visibleRange({ scrollTop: 22000, height: 440, count: 10000, rowHeight: 22, overscan: 10 }), {
    start: 990,
    end: 1030,
  });
  assert.deepEqual(visibleRange({ scrollTop: 0, height: 440, count: 5, rowHeight: 22, overscan: 10 }), {
    start: 0,
    end: 5,
  });
});

test("scrolling the list moves just far enough to show a row", () => {
  // Rows 10-29 are in view.
  const view = { scrollTop: 220, height: 440, rowHeight: 22 };
  assert.equal(scrollToReveal(view, 15), 220, "already in view");
  assert.equal(scrollToReveal(view, 5), 110, "above: its top meets the viewport's");
  assert.equal(scrollToReveal(view, 40), 462, "below: its bottom meets the viewport's");
});

test("a highlighted row takes its highlight's colour from the palette", () => {
  const palette = effectivePalette([{ color: "#111111" }]);
  assert.equal(rowHighlight({ Highlight: 1 }, palette), "#111111");
  assert.equal(rowHighlight({ Highlight: 6 }, palette), "#3b82f6");
  assert.equal(rowHighlight({ Highlight: 0 }, palette), null);
  assert.equal(rowHighlight({}, palette), null);
});

test("an old hex highlight in metadata isn't drawn; the migration makes it a number", () => {
  const palette = effectivePalette([{ color: "#111111" }]);
  assert.equal(rowHighlight({ Metadata: { highlight: "#EF4444" } }, palette), null);
});

// Marasi stores -1 for a pair with no response (status_code's default).
test("a pair without a response shows a pending status", () => {
  assert.equal(statusText(0), "…");
  assert.equal(statusText(-1), "…");
  assert.equal(statusText(undefined), "…");
  assert.equal(statusText(204), "204");
});
