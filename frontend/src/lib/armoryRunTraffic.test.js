import { test } from "node:test";
import assert from "node:assert/strict";
import { runTraffic } from "./armoryRunTraffic.js";

const pair = (id, run, extra = {}) => ({ ID: id, Metadata: { armory_run_id: run }, ...extra });

test("a run's traffic is its loaded pairs, then the recent ones it sent since, oldest first", () => {
  const loaded = [pair("p1", "r1"), pair("p2", "r1")];
  const recent = [pair("p2", "r1", { StatusCode: 200 }), pair("p3", "r2"), pair("p4", "r1")];
  assert.deepEqual(
    runTraffic(loaded, recent, "r1").map((p) => [p.ID, p.StatusCode]),
    [
      ["p1", undefined],
      ["p2", 200],
      ["p4", undefined],
    ],
  );
});

test("no run, no traffic", () => {
  assert.deepEqual(runTraffic([pair("p1", "r1")], [], null), []);
});
