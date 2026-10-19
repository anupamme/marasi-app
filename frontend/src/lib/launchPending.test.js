import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingLaunchIDs, pendingLaunchText, toastLaunchingRefusal } from "./launchPending.js";

// A toast store that keeps what it was given.
function toasts() {
  const shown = [];
  return { shown, trigger: (toast) => shown.push(toast) };
}

test("a refusal for pending launches toasts a warning with how many", () => {
  const store = toasts();
  assert.equal(toastLaunchingRefusal(store, "unlinking traffic: launch_pending (a, b): …", "removed", "entry"), true);
  assert.deepEqual(store.shown.map(({ message, background }) => [message, background]), [
    ["2 entries are still launching; nothing was removed", "variant-filled-warning"],
  ]);
});

test("any other error toasts nothing, so the caller reports it", () => {
  const store = toasts();
  assert.equal(toastLaunchingRefusal(store, new Error("disk full"), "deleted"), false);
  assert.deepEqual(store.shown, []);
});

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

test("on a launchpad the text counts entries", () => {
  assert.equal(pendingLaunchText(2, "moved", "entry"), "2 entries are still launching; nothing was moved");
  assert.equal(pendingLaunchText(1, "removed", "entry"), "1 entry is still launching; nothing was removed");
});
