import { test } from "node:test";
import assert from "node:assert/strict";
import { reportUnsavedDraftCount } from "./draftGuards.js";
import { createLaunchpadStore } from "./createLaunchpadStore.js";

function fakeApi() {
  return {
    getLaunchpads: async () => [
      { ID: "a", Name: "A" },
      { ID: "b", Name: "B" },
    ],
    getEntries: async (id) => [{ ID: `${id}-1` }],
    getRawDetails: async (id) => ({ Request: { ID: id, Raw: `GET /${id}` } }),
  };
}

test("the unsaved draft count is reported each time it changes, and only then", async () => {
  const store = createLaunchpadStore(fakeApi());
  const reported = [];
  const stop = reportUnsavedDraftCount(store, (count) => reported.push(count));

  await store.populate();
  store.updateDraft("a", "GET /edited");
  store.updateDraft("a", "GET /edited-again");
  await store.selectLaunchpad("b");
  store.updateDraft("b", "GET /b-edited");
  store.revertDraft("a");
  store.clear();
  stop();
  store.updateDraft("b", "GET /after-stop");

  assert.deepEqual(reported, [0, 1, 2, 1, 0]);
});
