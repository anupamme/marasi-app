// Message presentation: flags, payload note, row edge and properties.
// Message literals follow the prototype fixtures, shaped like Marasi's
// domain.WebSocketMessage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { messageFlags, messageProperties, messageRow, payloadNote } from "./presentation.js";

const toBase64 = (text) => Buffer.from(text).toString("base64");

function message(fields = {}) {
  return {
    ID: "0199d0a1-0000-7000-8000-000000000001",
    Direction: "client",
    Opcode: 1,
    Payload: toBase64("hello"),
    IsBinary: false,
    FrameCount: 1,
    Compressed: false,
    Metadata: {},
    ...fields,
  };
}

test("a message with every flag lists them most important first", () => {
  const flags = messageFlags(
    message({
      Metadata: {
        injected: true,
        dropped: true,
        close_error: "close code 1005 must not be sent on the wire",
        incomplete: true,
        inflate_error: "flate: corrupt input before offset 3",
        too_large: true,
        size_seen: 67_108_865,
        generated: true,
      },
    }),
  );
  assert.deepEqual(
    flags.map((flag) => [flag.key, flag.label, flag.tone]),
    [
      ["generated", "Proxy", "warning"],
      ["too_large", "Too large", "error"],
      ["inflate_error", "Corrupt", "error"],
      ["incomplete", "Cut short", "error"],
      ["close_error", "Bad close", "error"],
      ["dropped", "Dropped", "error"],
      ["injected", "Injected", "tertiary"],
    ],
  );
});

test("an ordinary or forwarded message has no flags", () => {
  assert.deepEqual(messageFlags(message()), []);
  assert.deepEqual(messageFlags(message({ Metadata: null })), []);
  // Marasi's interceptor stores dropped: false on a message it forwarded.
  assert.deepEqual(messageFlags(message({ Metadata: { intercepted: true, dropped: false } })), []);
});

test("flag tooltips carry the size seen and the error text", () => {
  const [tooLarge] = messageFlags(message({ Metadata: { too_large: true, size_seen: 67_108_865 } }));
  assert.match(tooLarge.title, /64\.0 MB seen/);
  const [corrupt] = messageFlags(message({ Metadata: { inflate_error: "flate: corrupt input before offset 3" } }));
  assert.match(corrupt.title, /flate: corrupt input before offset 3/);
  const [badClose] = messageFlags(
    message({ Opcode: 8, Metadata: { close_error: "close code 1005 must not be sent on the wire" } }),
  );
  assert.match(badClose.title, /close code 1005 must not be sent on the wire/);
});

test("a row edge is red for a problem, warning for Marasi's close, and none otherwise", () => {
  const cases = [
    [{}, null],
    [{ too_large: true, size_seen: 12 }, "error"],
    [{ inflate_error: "bad" }, "error"],
    [{ incomplete: true }, "error"],
    [{ close_error: "bad" }, "error"],
    [{ dropped: true }, null],
    [{ injected: true }, null],
    [{ generated: true }, "warning"],
    // A problem outranks Marasi's close; dropped never colours the edge.
    [{ generated: true, close_error: "bad" }, "error"],
    [{ generated: true, dropped: true }, "warning"],
    [{ dropped: true, incomplete: true }, "error"],
    [{ injected: true, dropped: true }, null],
  ];
  for (const [metadata, edge] of cases) {
    const row = messageRow(message({ Metadata: metadata }));
    assert.equal(row.edge, edge, JSON.stringify(metadata));
  }
  assert.equal(messageRow(message({ Metadata: { incomplete: true } })).edgeClass, "border-l-2 border-l-error-500");
  assert.equal(messageRow(message({ Metadata: { generated: true } })).edgeClass, "border-l-2 border-l-warning-500");
  assert.equal(messageRow(message()).edgeClass, "border-l-2 border-l-transparent");
});

test("a flagged row's tooltip lists its flags, and a forwarded one still says so", () => {
  const flagged = messageRow(message({ Metadata: { generated: true, too_large: true, size_seen: 2048 } }));
  assert.deepEqual(
    flagged.tooltip.split("\n").map((line) => line.split(":")[0]),
    ["Proxy", "Too large"],
  );
  assert.equal(messageRow(message()).tooltip, "");
  assert.equal(
    messageRow(message({ Metadata: { intercepted: true, dropped: false } })).tooltip,
    "Forwarded intercepted message",
  );
});

test("the payload note says when the payload shown is not the message", () => {
  const cases = [
    [message(), ""],
    [message({ Metadata: { injected: true, dropped: true, generated: true } }), ""],
    // A single over-limit frame keeps nothing.
    [
      message({ Opcode: 2, Payload: "", FrameCount: 0, Metadata: { too_large: true, size_seen: 67_108_865 } }),
      "Payload not kept: the message passed the size limit after 64.0 MB.",
    ],
    // A fragmented one keeps the fragments buffered before the limit.
    [
      message({ Payload: toBase64("123456"), FrameCount: 1, Metadata: { too_large: true, size_seen: 12 } }),
      "Showing only the first 6 B: the message passed the size limit after 12 B.",
    ],
    [
      message({ Compressed: true, Metadata: { inflate_error: "flate: corrupt input before offset 3" } }),
      "Showing the compressed bytes received. Decompression failed: flate: corrupt input before offset 3",
    ],
    [
      message({ Compressed: true, FrameCount: 2, Metadata: { incomplete: true } }),
      "Showing the compressed bytes received: the message ended before its final frame.",
    ],
    [
      message({ FrameCount: 2, Metadata: { incomplete: true } }),
      "Showing what arrived: the message ended before its final frame.",
    ],
  ];
  for (const [msg, note] of cases) {
    assert.equal(payloadNote(msg), note, JSON.stringify(msg.Metadata));
  }
});

test("the properties of an ordinary fragmented, compressed message", () => {
  const big = "x".repeat(3000);
  assert.deepEqual(
    messageProperties(message({ Direction: "server", Payload: toBase64(big), FrameCount: 12, Compressed: true })),
    { type: "text", direction: "server → client", size: "2.9 KB", frames: "12", compressed: "yes" },
  );
  assert.deepEqual(
    messageProperties(message({ Opcode: 2, IsBinary: true, Payload: toBase64("abcdefghij"), FrameCount: 3 })),
    { type: "binary", direction: "client → server", size: "10 B", frames: "3", compressed: "no" },
  );
});

test("a close Marasi sent is marked sent by Marasi in its direction", () => {
  const close = Buffer.from([0x03, 0xf1]).toString("base64");
  const toClient = messageProperties(message({ Direction: "server", Opcode: 8, Payload: close, Metadata: { generated: true } }));
  assert.equal(toClient.type, "close");
  assert.equal(toClient.direction, "server → client (sent by Marasi)");
  const upstream = messageProperties(message({ Direction: "client", Opcode: 8, Payload: close, Metadata: { generated: true } }));
  assert.equal(upstream.direction, "client → server (sent by Marasi)");
});

test("a too-large message shows the size seen, not the bytes kept", () => {
  const props = messageProperties(
    message({ Opcode: 2, Payload: "", FrameCount: 0, Metadata: { too_large: true, size_seen: 67_108_865 } }),
  );
  assert.equal(props.size, "> 64.0 MB");
  assert.equal(props.frames, "0");
  const fragmented = messageProperties(
    message({ Payload: toBase64("123456"), Metadata: { too_large: true, size_seen: 12 } }),
  );
  assert.equal(fragmented.size, "> 12 B");
});

// A message Marasi could not decompress is stored as the compressed bytes
// received, so its size is not the message's size.
test("a corrupt message's size is marked as the compressed size", () => {
  const props = messageProperties(
    message({ Opcode: 2, Payload: toBase64("abcdefghij"), Compressed: true, Metadata: { inflate_error: "flate: corrupt input" } }),
  );
  assert.equal(props.size, "10 B compressed");
});
