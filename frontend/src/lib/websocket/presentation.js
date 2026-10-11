// WebSocket presentation: the one place that turns Marasi's WebSocket data
// into display decisions. Pure JS, no Svelte, so it is tested with
// `node --test` and shared by the Ledger, the keybinding contexts, the
// request/response view and the WebSocket modal.

// --- Upgrade state ---------------------------------------------------------
//
// Call sites hold the upgrade request in different shapes. Each adapter
// reduces its shape to the same facts:
//   { protocol, statusCode, contentType, state }
// and `upgradePresentation` decides from those facts alone.

// Tailwind class per tone. Literal strings so Tailwind's content scan keeps them.
const TONE_CLASSES = {
  success: "text-success-500",
  warning: "text-warning-500",
  error: "text-error-500",
  neutral: "text-surface-400",
};

// How each `websocket.state` is shown. A state not listed here (including no
// state on a 101 or `protocol: websocket` row) uses FALLBACK_STATE.
const UPGRADE_STATES = {
  pending: { tone: "warning", slashed: false, tooltip: null, canOpen: true },
  open: { tone: "success", slashed: false, tooltip: null, canOpen: true },
  // Marasi rejected the handshake; the reason is an ERROR entry in Home's logs.
  failed: {
    tone: "error",
    slashed: true,
    tooltip: "WebSocket handshake failed — see the logs on Home",
    canOpen: false,
  },
  // The upgrade response was dropped in Checkpoint or by an extension: a
  // deliberate choice, so neutral rather than an error.
  dropped: {
    tone: "neutral",
    slashed: true,
    tooltip: "Upgrade response dropped",
    canOpen: false,
  },
};
const FALLBACK_STATE = { tone: "error", slashed: false, tooltip: null, canOpen: true };

const NOT_AN_UPGRADE = Object.freeze({
  isUpgrade: false,
  canOpen: false,
  state: "",
  tone: null,
  iconClass: "",
  slashed: false,
  tooltip: null,
});

// A Ledger table row: flat StatusCode and ContentType.
export function upgradeFromLedgerRow(row) {
  return {
    protocol: row?.Metadata?.protocol,
    statusCode: row?.StatusCode,
    contentType: row?.ContentType,
    state: row?.Metadata?.["websocket.state"],
  };
}

// A request with a nested Response (the request/response view's selected row,
// the WebSocket modal's upgrade request). `liveState` is the connection
// store's state, which is newer than the request's metadata when present.
export function upgradeFromRequest(request, liveState) {
  return {
    protocol: request?.Metadata?.protocol,
    statusCode: request?.Response?.StatusCode,
    contentType: request?.Response?.ContentType,
    state: liveState || request?.Metadata?.["websocket.state"],
  };
}

// A Ledger drawer's meta: lower-case `metadata`, and the response either as
// it arrived live (`incomingResponse`) or as loaded (`response`).
export function upgradeFromDrawerMeta(meta) {
  const response = meta?.incomingResponse || meta?.response;
  return {
    protocol: meta?.metadata?.protocol,
    statusCode: response?.StatusCode,
    contentType: response?.ContentType,
    state: meta?.metadata?.["websocket.state"],
  };
}

// The upgrade state presentation: whether the request is a WebSocket upgrade,
// whether its stream can be opened, and how its icon looks.
export function upgradePresentation(upgrade) {
  const state = upgrade?.state || "";
  const isUpgrade =
    upgrade?.protocol === "websocket" ||
    upgrade?.statusCode === 101 ||
    upgrade?.contentType === "websocket" ||
    Boolean(state);
  if (!isUpgrade) return NOT_AN_UPGRADE;
  const shown = UPGRADE_STATES[state] || FALLBACK_STATE;
  return {
    isUpgrade,
    canOpen: shown.canOpen,
    state,
    tone: shown.tone,
    iconClass: TONE_CLASSES[shown.tone],
    slashed: shown.slashed,
    tooltip: shown.tooltip,
  };
}

// --- Messages --------------------------------------------------------------
//
// A message is Marasi's domain.WebSocketMessage: a whole message, however many
// frames it arrived in. Its Metadata keys mark what Marasi did with it. Each
// check is on the value, not the key: a forwarded interception stores
// `dropped: false`.

// Bytes as B, KB or MB with one decimal.
export function formatSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return "";
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// The flags a message carries, most important first.
const MESSAGE_FLAGS = [
  {
    key: "generated",
    label: "Proxy",
    tone: "warning",
    title: () =>
      "Sent by Marasi, not the peer. Stored with the direction of the peer it imitates.",
  },
  {
    key: "too_large",
    label: "Too large",
    tone: "error",
    title: (m) =>
      `Over the size limit: ${formatSize(m.size_seen)} seen before Marasi closed the connection. Not forwarded.`,
  },
  {
    key: "inflate_error",
    label: "Corrupt",
    tone: "error",
    title: (m) => `Could not decompress: ${m.inflate_error}. Not forwarded.`,
  },
  {
    key: "incomplete",
    label: "Cut short",
    tone: "error",
    title: () => "The message ended before its final frame. Forwarded as received.",
  },
  {
    key: "close_error",
    label: "Bad close",
    tone: "error",
    title: (m) => `Invalid close frame, relayed unchanged: ${m.close_error}`,
  },
  {
    key: "dropped",
    label: "Dropped",
    tone: "error",
    title: () => "Dropped intercepted message",
  },
  {
    key: "injected",
    label: "Injected",
    tone: "tertiary",
    title: () => "Injected from Marasi",
  },
];

// [{ key, label, tone, title }] for each flag set on the message.
export function messageFlags(message) {
  const metadata = message?.Metadata || {};
  return MESSAGE_FLAGS.filter((flag) => metadata[flag.key]).map((flag) => ({
    key: flag.key,
    label: flag.label,
    tone: flag.tone,
    title: flag.title(metadata),
  }));
}

// Left edge per row tone. Literal strings so Tailwind's content scan keeps them.
const EDGE_CLASSES = {
  error: "border-l-2 border-l-error-500",
  warning: "border-l-2 border-l-warning-500",
  none: "border-l-2 border-l-transparent",
};

// A Stream row: its left edge and its tooltip. The edge is red for any
// error-tone flag except dropped (dropped rows keep their strike-through),
// warning for a close Marasi sent, and none otherwise.
export function messageRow(message) {
  const flags = messageFlags(message);
  const keys = new Set(flags.map((flag) => flag.key));
  let edge = null;
  if (flags.some((flag) => flag.tone === "error" && flag.key !== "dropped")) edge = "error";
  else if (keys.has("generated")) edge = "warning";

  let tooltip = flags.map((flag) => `${flag.label}: ${flag.title}`).join("\n");
  if (!tooltip && message?.Metadata?.intercepted) tooltip = "Forwarded intercepted message";

  return { edge, edgeClass: EDGE_CLASSES[edge || "none"], tooltip };
}

// The message's payload bytes. Wails sends Go's []byte as base64.
export function payloadBytes(message) {
  const payload = message?.Payload;
  if (!payload) return new Uint8Array();
  if (payload instanceof Uint8Array) return payload;
  if (Array.isArray(payload)) return Uint8Array.from(payload);
  try {
    return Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
  } catch {
    return new TextEncoder().encode(String(payload));
  }
}

// A note when the payload shown is not the message: not kept, partly kept,
// or still compressed. "" when the payload is the message.
export function payloadNote(message) {
  const metadata = message?.Metadata || {};
  if (metadata.too_large) {
    const limit = `the message passed the size limit after ${formatSize(metadata.size_seen)}.`;
    const kept = payloadBytes(message).length;
    return kept
      ? `Showing only the first ${formatSize(kept)}: ${limit}`
      : `Payload not kept: ${limit}`;
  }
  if (metadata.inflate_error) {
    return `Showing the compressed bytes received. Decompression failed: ${metadata.inflate_error}`;
  }
  if (metadata.incomplete) {
    const shown = message.Compressed ? "the compressed bytes received" : "what arrived";
    return `Showing ${shown}: the message ended before its final frame.`;
  }
  return "";
}

// Message type by opcode. A stored data message has its first frame's opcode.
const MESSAGE_TYPES = {
  0: "continuation",
  1: "text",
  2: "binary",
  8: "close",
  9: "ping",
  10: "pong",
};

const DIRECTIONS = {
  client: "client → server",
  server: "server → client",
};

// The properties grid's values, as display strings. A close Marasi sent is
// stored with the direction of the peer it imitates, so the direction says
// who really sent it. A message Marasi could not decompress keeps the
// compressed bytes, so its size says so.
export function messageProperties(message) {
  const metadata = message?.Metadata || {};
  const direction = DIRECTIONS[message?.Direction] ?? String(message?.Direction ?? "");
  const kept = formatSize(payloadBytes(message).length);
  return {
    type: MESSAGE_TYPES[message?.Opcode] ?? String(message?.Opcode ?? ""),
    direction: metadata.generated ? `${direction} (sent by Marasi)` : direction,
    size: metadata.too_large
      ? `> ${formatSize(metadata.size_seen)}`
      : metadata.inflate_error
        ? `${kept} compressed`
        : kept,
    frames: String(message?.FrameCount ?? ""),
    compressed: message?.Compressed ? "yes" : "no",
  };
}

// --- Connection summary ----------------------------------------------------
//
// What the Connection tab shows for a connection record
// (domain.WebSocketConnection).

const RECOMPRESS_NOTE =
  "Marasi decompresses each message and recompresses it for the other leg, so the bytes on the two legs differ.";

const takeover = (noContextTakeover) => (noContextTakeover ? "no (reset per message)" : "yes");

function deflateRows(deflate) {
  return [
    { label: "Extension", value: "permessage-deflate" },
    { label: "Client context takeover", value: takeover(deflate.ClientNoContextTakeover) },
    { label: "Server context takeover", value: takeover(deflate.ServerNoContextTakeover) },
    { label: "Client max window", value: `${deflate.ClientMaxWindowBits} bits` },
    { label: "Server max window", value: `${deflate.ServerMaxWindowBits} bits` },
  ];
}

// Without a connection record (none stored for this upgrade), what was
// negotiated is unknown, which is not the same as "none".
const NOT_RECORDED = "not recorded";

function compressionRows(connection) {
  if (!connection) return [{ label: "Extension", value: NOT_RECORDED }];
  if (!connection.Deflate) return [{ label: "Extension", value: "none negotiated" }];
  return deflateRows(connection.Deflate);
}

// Marasi closed the connection when it sent a close of its own: a message
// whose metadata is marked generated.
const isClosedByMarasi = (messages) => (messages ?? []).some((m) => Boolean(m?.Metadata?.generated));

function closeText(code, reason, closedByMarasi) {
  const parts = [];
  if (code) parts.push(reason ? `${code} ${reason}` : String(code));
  if (closedByMarasi) parts.push("closed by Marasi");
  return parts.length ? parts.join(" — ") : "—";
}

// `connection` is the connection record, or null when none is stored. The
// close then comes from the upgrade `request`'s `websocket.*` metadata.
// `messages` are the connection's stored messages.
export function connectionSummary({ connection, request, messages } = {}) {
  const metadata = request?.Metadata ?? {};
  const code = connection ? connection.CloseCode : metadata["websocket.close_code"];
  const reason = connection ? connection.CloseReason : metadata["websocket.close_reason"];
  const closedByMarasi = isClosedByMarasi(messages);
  // Go sends a nil RemovedExtensions slice as null.
  const strippedOffers = connection?.RemovedExtensions ?? [];
  return {
    close: closeText(code, reason, closedByMarasi),
    closedByMarasi,
    compression: compressionRows(connection),
    compressionNote: connection?.Deflate ? RECOMPRESS_NOTE : "",
    strippedOffers,
    strippedNone: strippedOffers.length ? "" : connection ? "none" : NOT_RECORDED,
  };
}
