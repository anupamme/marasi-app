import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionSummary } from "./presentation.js";

// Connection records as Marasi sends them (domain.WebSocketConnection).
const chat = {
  ID: "conn-chat",
  RequestID: "req-chat",
  State: "open",
  Transport: "wss",
  Host: "chat.example.com",
  Path: "/socket",
  CloseCode: 0,
  CloseReason: "",
  Deflate: {
    ServerNoContextTakeover: false,
    ClientNoContextTakeover: true,
    ServerMaxWindowBits: 15,
    ClientMaxWindowBits: 10,
  },
  RemovedExtensions: ["x-webkit-deflate-frame", "x-custom-mux"],
};

const upload = {
  ID: "conn-upload",
  RequestID: "req-upload",
  State: "closed",
  Transport: "ws",
  Host: "files.internal:8080",
  Path: "/upload",
  CloseCode: 1009,
  CloseReason: "message too big",
  Deflate: null,
  RemovedExtensions: null,
};

test("a deflate connection spells out its parameters and says Marasi recompresses each leg", () => {
  const summary = connectionSummary({ connection: chat });
  assert.deepEqual(summary.compression, [
    { label: "Extension", value: "permessage-deflate" },
    { label: "Client context takeover", value: "no (reset per message)" },
    { label: "Server context takeover", value: "yes" },
    { label: "Client max window", value: "10 bits" },
    { label: "Server max window", value: "15 bits" },
  ]);
  assert.equal(
    summary.compressionNote,
    "Marasi decompresses each message and recompresses it for the other leg, so the bytes on the two legs differ.",
  );
});

test("a connection without deflate says none was negotiated", () => {
  const summary = connectionSummary({ connection: upload });
  assert.deepEqual(summary.compression, [{ label: "Extension", value: "none negotiated" }]);
  assert.equal(summary.compressionNote, "");
});

test("the offers Marasi stripped are listed, or none when Marasi stripped nothing", () => {
  assert.deepEqual(connectionSummary({ connection: chat }).strippedOffers, ["x-webkit-deflate-frame", "x-custom-mux"]);
  assert.equal(connectionSummary({ connection: chat }).strippedNone, "");
  for (const RemovedExtensions of [null, [], undefined]) {
    const summary = connectionSummary({ connection: { ...upload, RemovedExtensions } });
    assert.deepEqual(summary.strippedOffers, [], String(RemovedExtensions));
    assert.equal(summary.strippedNone, "none", String(RemovedExtensions));
  }
});

// Stored messages, trimmed to what the summary reads.
const message = (direction, opcode, Metadata = {}) => ({ Direction: direction, Opcode: opcode, Metadata });
const marasiCloses = [
  message("client", 1),
  message("client", 2, { too_large: true, size_seen: 67_108_865 }),
  message("server", 8, { generated: true }),
  message("client", 8, { generated: true }),
];

test("a connection with a message Marasi generated is marked closed by Marasi", () => {
  const summary = connectionSummary({ connection: upload, messages: marasiCloses });
  assert.equal(summary.closedByMarasi, true);
  assert.equal(summary.close, "1009 message too big — closed by Marasi");
});

test("a close with no message from Marasi shows only the code and reason", () => {
  const peerClose = [message("client", 1), message("server", 8, { generated: false, intercepted: true })];
  const summary = connectionSummary({ connection: upload, messages: peerClose });
  assert.equal(summary.closedByMarasi, false);
  assert.equal(summary.close, "1009 message too big");
  assert.equal(connectionSummary({ connection: { ...upload, CloseReason: "" } }).close, "1009");
});

test("an open connection has no close yet", () => {
  assert.equal(connectionSummary({ connection: chat, messages: [message("client", 1)] }).close, "—");
});

test("without a connection record, the close comes from the upgrade request's metadata", () => {
  const request = { Metadata: { "websocket.close_code": 1000, "websocket.close_reason": "bye" } };
  assert.equal(connectionSummary({ connection: null, request }).close, "1000 bye");
  assert.equal(connectionSummary({ connection: null, request, messages: marasiCloses }).close, "1000 bye — closed by Marasi");
  assert.equal(connectionSummary({ connection: null, request: { Metadata: {} } }).close, "—");
  assert.equal(connectionSummary({ connection: null, request: { Metadata: {} }, messages: marasiCloses }).close, "closed by Marasi");
});

test("without a connection record, compression and stripped offers are unknown rather than none", () => {
  const summary = connectionSummary({ connection: null });
  assert.deepEqual(summary.compression, [{ label: "Extension", value: "not recorded" }]);
  assert.equal(summary.compressionNote, "");
  assert.deepEqual(summary.strippedOffers, []);
  assert.equal(summary.strippedNone, "not recorded");
});
