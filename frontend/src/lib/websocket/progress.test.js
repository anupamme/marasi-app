import { test } from "node:test";
import assert from "node:assert/strict";
import { applyProgress, clearProgress, finishMessage, holdMessage, progressChip } from "./progress.js";

const progress = (fields) => ({
  MessageID: "m1",
  ConnectionID: "c1",
  RequestID: "r1",
  Direction: "server",
  Opcode: 2,
  Bytes: 32768,
  Frames: 1,
  ...fields,
});

test("a progress event replaces the connection's progress record", () => {
  let state = applyProgress({}, progress({ Bytes: 32768 }));
  state = applyProgress(state, progress({ Bytes: 65536, Frames: 2 }));
  assert.deepEqual(state, { r1: progress({ Bytes: 65536, Frames: 2 }) });
});

test("the message with the progress record's id clears it", () => {
  const state = applyProgress({}, progress({ MessageID: "m1" }));
  assert.deepEqual(finishMessage(state, { ID: "m1", RequestID: "r1" }), {});
});

test("a different message on the connection leaves the progress record", () => {
  const state = applyProgress({}, progress({ MessageID: "m1" }));
  assert.deepEqual(finishMessage(state, { ID: "m0", RequestID: "r1" }), state);
});

test("closing a connection clears only its progress record", () => {
  let state = applyProgress({}, progress({ RequestID: "r1" }));
  state = applyProgress(state, progress({ RequestID: "r2", MessageID: "m2" }));
  assert.deepEqual(clearProgress(state, "r1"), { r2: progress({ RequestID: "r2", MessageID: "m2" }) });
});

// ws-progress is emitted from its own queue, so it can reach the frontend
// after the message it describes or after the connection closed.
test("progress for a message that has already arrived is ignored", () => {
  const state = applyProgress({}, progress({ MessageID: "m1" }), {
    messages: [{ ID: "m0" }, { ID: "m1" }],
  });
  assert.deepEqual(state, {});
});

test("progress for a closed connection is ignored", () => {
  for (const State of ["closed", "error"]) {
    const state = applyProgress({}, progress(), { connection: { State } });
    assert.deepEqual(state, {}, State);
  }
});

// A message Checkpoint holds has been received in full, so the chip must not
// keep saying "receiving" while it waits for a forward or drop.
test("a message held in Checkpoint clears its progress record", () => {
  const state = applyProgress({}, progress({ MessageID: "m1" }));
  assert.deepEqual(holdMessage(state, { ID: "m1", RequestID: "r1" }), {});
});

test("a held message leaves progress for another message on the connection", () => {
  const state = applyProgress({}, progress({ MessageID: "m2" }));
  assert.deepEqual(holdMessage(state, { ID: "m1", RequestID: "r1" }), state);
});

test("progress for a message already held in Checkpoint is ignored", () => {
  const state = applyProgress({}, progress({ MessageID: "m1" }), {
    held: [{ ID: "m1" }],
    connection: { State: "open" },
  });
  assert.deepEqual(state, {});
});

test("progress for an open connection with earlier messages is kept", () => {
  const state = applyProgress({}, progress({ MessageID: "m1" }), {
    messages: [{ ID: "m0" }],
    connection: { State: "open" },
  });
  assert.deepEqual(state, { r1: progress({ MessageID: "m1" }) });
});

test("the chip shows the bytes and frames received, with an arrow for the direction", () => {
  assert.deepEqual(progressChip(progress({ Direction: "server", Bytes: 1572864, Frames: 3 })), {
    arrow: "↓",
    label: "receiving 1.5 MB · 3 frames",
  });
  assert.deepEqual(progressChip(progress({ Direction: "client", Bytes: 32768, Frames: 1 })), {
    arrow: "↑",
    label: "receiving 32.0 KB · 1 frame",
  });
  assert.equal(progressChip(progress({ Bytes: 512, Frames: 2 })).label, "receiving 512 B · 2 frames");
});
