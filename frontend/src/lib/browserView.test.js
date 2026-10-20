import { test } from "node:test";
import assert from "node:assert/strict";
import { CERT_URL, browserViewRefusal, browserViewURL } from "./browserView.js";

test("Marasi's own pages are on the host marasi", () => {
  assert.equal(CERT_URL, "http://marasi/cert");
  assert.equal(
    browserViewURL("0b6e1c52-3f7d-4c55-9a43-2f1d8f0e9a11"),
    "http://marasi/view/0b6e1c52-3f7d-4c55-9a43-2f1d8f0e9a11",
  );
});

test("a pair has no browser view without a response or as a WebSocket upgrade", () => {
  assert.equal(browserViewRefusal({ StatusCode: 200 }), null);
  assert.equal(browserViewRefusal({ StatusCode: 302 }), null);
  assert.equal(browserViewRefusal({ StatusCode: 0 }), "No response yet");
  assert.equal(browserViewRefusal({ StatusCode: -1 }), "No response yet");
  assert.equal(browserViewRefusal(undefined), "No response yet");
  assert.equal(browserViewRefusal({ StatusCode: 101 }), "Not for a WebSocket upgrade");
});
