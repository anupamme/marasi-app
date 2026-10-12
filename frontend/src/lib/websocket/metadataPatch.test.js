import { test } from "node:test";
import assert from "node:assert/strict";
import { webSocketMetadataPatch } from "./metadataPatch.js";

test("a connection event patches state, transport and close", () => {
	assert.deepEqual(
		webSocketMetadataPatch({ RequestID: "r", State: "closed", Transport: "ws", CloseCode: 1000, CloseReason: "bye" }),
		{
			protocol: "websocket",
			"websocket.state": "closed",
			"websocket.transport": "ws",
			"websocket.close_code": 1000,
			"websocket.close_reason": "bye",
		},
	);
});

test("a state-only event leaves the row's other WebSocket fields alone", () => {
	assert.deepEqual(webSocketMetadataPatch({ RequestID: "r", State: "failed" }), {
		protocol: "websocket",
		"websocket.state": "failed",
	});
});

test("an event without a state means closed", () => {
	assert.equal(webSocketMetadataPatch({ RequestID: "r" })["websocket.state"], "closed");
});
