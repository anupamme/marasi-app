package main

import (
	"fmt"
	"io"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestAppWebSocketUpgradeEndedState(t *testing.T) {
	t.Run("should emit ws-state dropped when an extension drops the upgrade response", func(t *testing.T) {
		upstream := newWebSocketUpstream(t, "never relayed")
		app := newScratchpadApp(t)
		events := &recordedEvents{}
		app.emitEvent = events.emit
		if err := app.RunExtension("workshop", "function processResponse(res)\n\tres:drop()\nend\n"); err != nil {
			t.Fatalf("installing dropping hook: %v", err)
		}
		if err := app.StartProxy("127.0.0.1", "0"); err != nil {
			t.Fatalf("starting listener: %v", err)
		}

		sendUpgradeThroughApp(t, app, upstream.URL, nil)

		state := waitForUpgradeState(t, events)
		if state.State != "dropped" {
			t.Fatalf("wanted state %q\ngot: %q", "dropped", state.State)
		}
		waitForStoredState(t, app, state.RequestID, "dropped")
	})

	t.Run("should emit ws-state failed when the proxy cannot complete the handshake", func(t *testing.T) {
		// The client offers deflate without client_max_window_bits, so the
		// origin's client_max_window_bits=10 cannot be accepted.
		upstream := newNegotiatingUpstream(t, []string{"permessage-deflate; client_max_window_bits=10"})
		app := newScratchpadApp(t)
		events := &recordedEvents{}
		app.emitEvent = events.emit
		if err := app.StartProxy("127.0.0.1", "0"); err != nil {
			t.Fatalf("starting listener: %v", err)
		}

		sendUpgradeThroughApp(t, app, upstream.URL, []string{"permessage-deflate"})

		state := waitForUpgradeState(t, events)
		if state.State != "failed" {
			t.Fatalf("wanted state %q\ngot: %q", "failed", state.State)
		}
		waitForStoredState(t, app, state.RequestID, "failed")
	})
}

// sendUpgradeThroughApp writes a WebSocket upgrade request for upstreamURL to
// the app's proxy listener, offering the given extensions, without waiting
// for a response. The client connection is closed when the test ends.
func sendUpgradeThroughApp(t *testing.T, app *App, upstreamURL string, offers []string) {
	t.Helper()
	client, err := net.Dial("tcp", listenerAddress(t, app))
	if err != nil {
		t.Fatalf("dialing proxy: %v", err)
	}
	t.Cleanup(func() { client.Close() })
	var request strings.Builder
	fmt.Fprintf(&request, "GET %s/socket HTTP/1.1\r\nHost: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n",
		upstreamURL, strings.TrimPrefix(upstreamURL, "http://"))
	for _, offer := range offers {
		fmt.Fprintf(&request, "Sec-WebSocket-Extensions: %s\r\n", offer)
	}
	request.WriteString("\r\n")
	if _, err := io.WriteString(client, request.String()); err != nil {
		t.Fatalf("writing upgrade request: %v", err)
	}
}

func waitForUpgradeState(t *testing.T, events *recordedEvents) webSocketUpgradeState {
	t.Helper()
	data := waitForEvent(t, events, "ws-state")
	state, ok := data[0].(webSocketUpgradeState)
	if !ok {
		t.Fatalf("wanted ws-state data webSocketUpgradeState\ngot: %T", data[0])
	}
	if state.RequestID == uuid.Nil {
		t.Fatal("wanted ws-state for the upgrade request\ngot: no request ID")
	}
	return state
}

// waitForStoredState waits until Marasi's stored websocket.state for the
// request matches the state the event reported.
func waitForStoredState(t *testing.T, app *App, requestID uuid.UUID, want string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	var got any
	for time.Now().Before(deadline) {
		if metadata, err := app.Proxy.TrafficRepo.GetMetadata(requestID); err == nil {
			if got = metadata["websocket.state"]; got == want {
				return
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("wanted stored websocket.state %q\ngot: %v", want, got)
}
