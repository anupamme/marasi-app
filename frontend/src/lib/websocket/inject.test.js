import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INJECT_OPCODES,
  draftOpcode,
  nextInjectOpcode,
  offersSendUncompressed,
} from "./inject.js";

const TEXT = 1;
const BINARY = 2;
const CLOSE = 8;
const PING = 9;
const PONG = 10;
const CONTINUATION = 0;

test("the Inject opcode list is Text, Binary, Close, Ping and Pong", () => {
  assert.deepEqual(
    INJECT_OPCODES.map(({ value, label }) => [value, label]),
    [
      [TEXT, "Text"],
      [BINARY, "Binary"],
      [CLOSE, "Close"],
      [PING, "Ping"],
      [PONG, "Pong"],
    ],
  );
});

test("the cycle-opcode key steps through the offered opcodes and never lands on Continuation", () => {
  const visited = [];
  let opcode = TEXT;
  for (let i = 0; i < 6; i++) {
    opcode = nextInjectOpcode(opcode);
    visited.push(opcode);
  }
  assert.deepEqual(visited, [BINARY, CLOSE, PING, PONG, TEXT, BINARY]);
});

test("the cycle-opcode key moves an unoffered opcode to Text", () => {
  assert.equal(nextInjectOpcode(CONTINUATION), TEXT);
  assert.equal(nextInjectOpcode("2"), CLOSE);
});

test("a draft copied from a message keeps an offered opcode", () => {
  assert.equal(draftOpcode(BINARY), BINARY);
  assert.equal(draftOpcode(PONG), PONG);
});

test("a draft copied from a message whose opcode is no longer offered is Text", () => {
  assert.equal(draftOpcode(CONTINUATION), TEXT);
  assert.equal(draftOpcode(3), TEXT);
  assert.equal(draftOpcode(undefined), TEXT);
});

test("Send uncompressed is offered for text and binary on a deflate connection", () => {
  const connection = { Deflate: { ServerMaxWindowBits: 15, ClientMaxWindowBits: 15 } };
  assert.equal(offersSendUncompressed(connection, TEXT), true);
  assert.equal(offersSendUncompressed(connection, "2"), true);
});

test("Send uncompressed is hidden for Close, Ping and Pong", () => {
  const connection = { Deflate: { ServerMaxWindowBits: 15, ClientMaxWindowBits: 15 } };
  for (const opcode of [CLOSE, PING, PONG]) {
    assert.equal(offersSendUncompressed(connection, opcode), false, `opcode ${opcode}`);
  }
});

test("Send uncompressed is hidden on a connection without deflate", () => {
  assert.equal(offersSendUncompressed({ Deflate: null }, TEXT), false);
  assert.equal(offersSendUncompressed({}, BINARY), false);
  assert.equal(offersSendUncompressed(undefined, TEXT), false);
});
