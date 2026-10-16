import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { createRecentTrafficStore } from "./createRecentTrafficStore.js";

const pair = (n, extra = {}) => ({ ID: `p${n}`, Path: `/${n}`, ...extra });

function fakeApi(newestFirst = []) {
  const calls = [];
  return {
    calls,
    queryTraffic: async (req) => {
      calls.push(req);
      return { Items: newestFirst.slice(0, req.Limit).map((p) => ({ ...p })) };
    },
  };
}

test("it loads the newest pairs of every content type, oldest first", async () => {
  const api = fakeApi([pair(3), pair(2), pair(1)]);
  const store = createRecentTrafficStore(api, 2);
  await store.populate();
  assert.deepEqual(get(store).map((p) => p.ID), ["p2", "p3"]);
  assert.deepEqual(api.calls, [
    { Query: "", OrderBy: "requested_at desc", Limit: 2, IgnoreExclusion: true },
  ]);
});

test("new pairs join on flush, their responses fill them in, and the oldest drop past the limit", async () => {
  const store = createRecentTrafficStore(fakeApi([pair(1)]), 2);
  await store.populate();
  store.onRequest(pair(2));
  store.onRequest(pair(3));
  store.onResponse({ ID: "p3", StatusCode: 200 });
  assert.equal(get(store).length, 1, "events wait for the flush");
  store.flush();
  assert.deepEqual(get(store), [pair(2), pair(3, { StatusCode: 200 })]);

  store.onResponse({ ID: "p2", StatusCode: 404 });
  store.flush();
  assert.equal(get(store)[0].StatusCode, 404);
});

test("clearing for another project drops a load still in flight", async () => {
  let release;
  const store = createRecentTrafficStore({ queryTraffic: () => new Promise((r) => (release = r)) });
  const loading = store.populate();
  store.clear();
  release({ Items: [pair(1)] });
  await loading;
  assert.deepEqual(get(store), []);
});
