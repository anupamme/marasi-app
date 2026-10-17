import { test } from "node:test";
import assert from "node:assert/strict";
import { checkResultNotice, showsUpdateIndicator } from "./updates.js";

const running = { Channel: "release", Version: "16.10.2026" };

test("a check that finds nothing says the researcher is on the latest build of their channel", () => {
  assert.deepEqual(checkResultNotice({ Outcome: "none", Channel: "release", Running: running }), {
    message: "You're on the latest release build",
    background: "variant-filled-success",
  });
  assert.equal(
    checkResultNotice({ Outcome: "none", Channel: "nightly", Running: running }).message,
    "You're on the latest nightly build",
  );
});

test("a failed check states the reason", () => {
  assert.deepEqual(
    checkResultNotice({ Outcome: "failed", Channel: "release", Reason: "could not reach GitHub: no such host" }),
    {
      message: "Could not check for updates: could not reach GitHub: no such host",
      background: "variant-filled-error",
    },
  );
});

test("a development build says it does not check for updates", () => {
  assert.deepEqual(checkResultNotice({ Outcome: "unavailable", Channel: "" }), {
    message: "Development builds don't check for updates",
    background: "variant-filled-warning",
  });
});

test("a check that finds an update has no notice, because the details panel opens instead", () => {
  assert.equal(checkResultNotice({ Outcome: "available", Update: { Version: "17.10.2026" } }), null);
});

test("the indicator shows only while an update is available", () => {
  assert.equal(showsUpdateIndicator({ Status: "available", Update: { Version: "17.10.2026" } }), true);
  assert.equal(showsUpdateIndicator({ Status: "idle" }), false);
  assert.equal(showsUpdateIndicator({ Status: "unavailable" }), false);
  assert.equal(showsUpdateIndicator(null), false);
});
