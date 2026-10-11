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
};

// How each `websocket.state` is shown. A state not listed here (including no
// state on a 101 or `protocol: websocket` row) uses FALLBACK_STATE.
const UPGRADE_STATES = {
  pending: { tone: "warning", slashed: false, tooltip: null, canOpen: true },
  open: { tone: "success", slashed: false, tooltip: null, canOpen: true },
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
