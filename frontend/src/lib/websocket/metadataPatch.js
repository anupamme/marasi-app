// The Ledger metadata a WebSocket event changes on its upgrade row.

/**
 * Returns the websocket.* metadata patch for a ws-open, ws-close or ws-state
 * event. ws-state carries only the state, so fields the event lacks are
 * left out rather than overwriting the row's values with undefined.
 */
export function webSocketMetadataPatch(conn) {
	const patch = { protocol: "websocket", "websocket.state": conn.State || "closed" };
	const fields = {
		"websocket.transport": conn.Transport,
		"websocket.close_code": conn.CloseCode,
		"websocket.close_reason": conn.CloseReason,
	};
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) patch[key] = value;
	}
	return patch;
}
