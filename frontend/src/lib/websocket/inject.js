// WebSocket Inject decisions. Pure JS, no Svelte, so it is tested with
// `node --test` and used by the Inject tab and its cycle-opcode key.

const TEXT = 1;
const BINARY = 2;

// The opcodes Inject offers. Continuation is not one: Marasi injects whole
// messages, so a lone continuation frame would break the stream.
export const INJECT_OPCODES = Object.freeze([
  { value: TEXT, label: "Text" },
  { value: BINARY, label: "Binary" },
  { value: 8, label: "Close" },
  { value: 9, label: "Ping" },
  { value: 10, label: "Pong" },
]);

const OFFERED = INJECT_OPCODES.map(({ value }) => value);

// The opcode a draft copied from a message starts with: the message's own
// opcode when Inject offers it, otherwise Text.
export function draftOpcode(opcode) {
  const value = Number(opcode);
  return OFFERED.includes(value) ? value : TEXT;
}

// The opcode after `opcode` in the offered list, wrapping round. An opcode
// that is not offered moves to Text.
export function nextInjectOpcode(opcode) {
  const index = OFFERED.indexOf(Number(opcode));
  if (index === -1) return TEXT;
  return OFFERED[(index + 1) % OFFERED.length];
}

// Whether the "Send uncompressed" option does anything: the connection
// negotiated permessage-deflate and the opcode is a data opcode.
export function offersSendUncompressed(connection, opcode) {
  const value = Number(opcode);
  return Boolean(connection?.Deflate) && (value === TEXT || value === BINARY);
}
