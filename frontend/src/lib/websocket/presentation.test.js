import { test } from "node:test";
import assert from "node:assert/strict";
import {
  upgradeFromDrawerMeta,
  upgradeFromLedgerRow,
  upgradeFromRequest,
  upgradePresentation,
} from "./presentation.js";

test("a Ledger row with WebSocket protocol metadata is an openable upgrade", () => {
  const view = upgradePresentation(upgradeFromLedgerRow({ Metadata: { protocol: "websocket" } }));
  assert.equal(view.isUpgrade, true);
  assert.equal(view.canOpen, true);
});

test("a Ledger row with a 101 status or a websocket content type is an openable upgrade", () => {
  for (const row of [{ StatusCode: 101 }, { ContentType: "websocket" }]) {
    const view = upgradePresentation(upgradeFromLedgerRow(row));
    assert.equal(view.isUpgrade, true, JSON.stringify(row));
    assert.equal(view.canOpen, true, JSON.stringify(row));
  }
});

test("the upgrade icon is green while open, yellow while pending, red otherwise", () => {
  const cases = [
    ["open", "success", "text-success-500"],
    ["pending", "warning", "text-warning-500"],
    ["closed", "error", "text-error-500"],
    ["error", "error", "text-error-500"],
    [undefined, "error", "text-error-500"],
  ];
  for (const [state, tone, iconClass] of cases) {
    const row = { Metadata: { protocol: "websocket", "websocket.state": state } };
    const view = upgradePresentation(upgradeFromLedgerRow(row));
    assert.equal(view.tone, tone, String(state));
    assert.equal(view.iconClass, iconClass, String(state));
    assert.equal(view.slashed, false, String(state));
    assert.equal(view.canOpen, true, String(state));
  }
});

test("a 101 row with no state shows the error colour, as today", () => {
  const view = upgradePresentation(upgradeFromLedgerRow({ StatusCode: 101 }));
  assert.equal(view.tone, "error");
});

test("a Ledger drawer's request is openable from metadata, its response, or a WebSocket state", () => {
  const openable = [
    { metadata: { protocol: "websocket" } },
    { metadata: {}, response: { StatusCode: 101 } },
    { metadata: {}, response: { ContentType: "websocket" } },
    { metadata: {}, incomingResponse: { StatusCode: 101 }, response: { StatusCode: 200 } },
    { metadata: { "websocket.state": "closed" } },
  ];
  for (const meta of openable) {
    assert.equal(upgradePresentation(upgradeFromDrawerMeta(meta)).canOpen, true, JSON.stringify(meta));
  }
  for (const meta of [undefined, {}, { metadata: {}, response: { StatusCode: 200, ContentType: "json" } }]) {
    assert.equal(upgradePresentation(upgradeFromDrawerMeta(meta)).canOpen, false, JSON.stringify(meta));
  }
});

test("a request with a nested Response is read the same way, and a live state overrides its metadata", () => {
  const cases = [
    [{ Metadata: { protocol: "websocket" } }, undefined, true, "error"],
    [{ Metadata: {}, Response: { StatusCode: 101 } }, undefined, true, "error"],
    [{ Metadata: {}, Response: { ContentType: "websocket" } }, undefined, true, "error"],
    [{ Metadata: { "websocket.state": "pending" } }, undefined, true, "warning"],
    [{ Metadata: { protocol: "websocket", "websocket.state": "pending" } }, "open", true, "success"],
    [{ Metadata: {}, Response: { StatusCode: 200 } }, undefined, false, null],
  ];
  for (const [request, liveState, canOpen, tone] of cases) {
    const view = upgradePresentation(upgradeFromRequest(request, liveState));
    assert.equal(view.canOpen, canOpen, JSON.stringify(request));
    assert.equal(view.tone, tone, JSON.stringify(request));
  }
});

test("a failed handshake shows a slashed red icon, points to Home's logs, and cannot be opened", () => {
  const view = upgradePresentation(
    upgradeFromLedgerRow({ Metadata: { protocol: "websocket", "websocket.state": "failed" } }),
  );
  assert.equal(view.isUpgrade, true);
  assert.equal(view.state, "failed");
  assert.equal(view.tone, "error");
  assert.equal(view.iconClass, "text-error-500");
  assert.equal(view.slashed, true);
  assert.equal(view.tooltip, "WebSocket handshake failed — see the logs on Home");
  assert.equal(view.canOpen, false);
});

test("a dropped upgrade response shows a slashed neutral icon, says it was dropped, and cannot be opened", () => {
  const view = upgradePresentation(
    upgradeFromLedgerRow({ Metadata: { protocol: "websocket", "websocket.state": "dropped" } }),
  );
  assert.equal(view.isUpgrade, true);
  assert.equal(view.tone, "neutral");
  assert.equal(view.iconClass, "text-surface-400");
  assert.equal(view.slashed, true);
  assert.equal(view.tooltip, "Upgrade response dropped");
  assert.equal(view.canOpen, false);
});

test("an ordinary Ledger row is not an upgrade and gets no WebSocket icon", () => {
  const view = upgradePresentation(upgradeFromLedgerRow({ StatusCode: 200, ContentType: "html", Metadata: {} }));
  assert.equal(view.isUpgrade, false);
  assert.equal(view.canOpen, false);
  assert.equal(view.tone, null);
  assert.equal(view.iconClass, "");
});
