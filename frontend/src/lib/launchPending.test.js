import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingLaunchIDs, pendingLaunchText } from "./launchPending.js";

test("a launch_pending refusal's pairs are read from the error's text", () => {
  const error =
    "deleting traffic: launch_pending (0192f0a4-0000-7000-8000-000000000001, 0192f0a4-0000-7000-8000-000000000002): a launch is pending";
  assert.deepEqual(pendingLaunchIDs(error), [
    "0192f0a4-0000-7000-8000-000000000001",
    "0192f0a4-0000-7000-8000-000000000002",
  ]);
  assert.deepEqual(pendingLaunchIDs(new Error("deleting launchpad: launch_pending (abc): …")), ["abc"]);
  assert.equal(pendingLaunchIDs("deleting traffic: selection_incomplete (sitemap): …"), null);
  assert.equal(pendingLaunchIDs(undefined), null);
});

test("the text says how many pairs are launching and that nothing changed", () => {
  assert.equal(pendingLaunchText(3, "deleted"), "3 pairs are still launching; nothing was deleted");
  assert.equal(pendingLaunchText(1, "removed"), "1 pair is still launching; nothing was removed");
});
