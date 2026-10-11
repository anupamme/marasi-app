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
