import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEDGER_COLUMNS,
  badgeSlots,
  formatSize,
  rowBadges,
  rowHighlight,
  rowTemplate,
  scrollToReveal,
  shortType,
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

test("every row lays its cells out on the same grid; the path takes the spare width", () => {
  assert.equal(
    rowTemplate(LEDGER_COLUMNS),
    "52px 46px 70px 56px 170px minmax(180px,1fr) 50px 48px 62px",
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

test("an old hex highlight in metadata shows its palette colour, or the hex itself", () => {
  const palette = effectivePalette([{ color: "#111111" }]);
  assert.equal(rowHighlight({ Metadata: { highlight: "#EF4444" } }, palette), "#111111");
  assert.equal(rowHighlight({ Metadata: { highlight: "#3B82F6" } }, palette), "#3b82f6");
  assert.equal(rowHighlight({ Metadata: { highlight: "#123456" } }, palette), "#123456");
  assert.equal(rowHighlight({ Metadata: { highlight: "" } }, palette), null);
});
