package main

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/tfkr-ae/marasi/domain"
)

func TestAppWebSocketEvents(t *testing.T) {
	t.Run("should emit ws-open and ws-message through the app's emitter", func(t *testing.T) {
		upstream := newWebSocketUpstream(t, "hello from upstream")
		app := newScratchpadApp(t)
		events := &recordedEvents{}
		app.emitEvent = events.emit
		if err := app.StartProxy("127.0.0.1", "0"); err != nil {
			t.Fatalf("starting listener: %v", err)
		}

		upgradeThroughApp(t, app, upstream)

		openData := waitForEvent(t, events, "ws-open")
		conn, ok := openData[0].(domain.WebSocketConnection)
		if !ok {
			t.Fatalf("wanted ws-open data domain.WebSocketConnection\ngot: %T", openData[0])
		}
		if conn.State != "open" {
			t.Fatalf("wanted state %q\ngot: %q", "open", conn.State)
		}
		messageData := waitForEvent(t, events, "ws-message")
		message, ok := messageData[0].(domain.WebSocketMessage)
		if !ok {
			t.Fatalf("wanted ws-message data domain.WebSocketMessage\ngot: %T", messageData[0])
		}
		if string(message.Payload) != "hello from upstream" {
			t.Fatalf("wanted payload %q\ngot: %q", "hello from upstream", message.Payload)
		}
		if message.ConnectionID != conn.ID {
			t.Fatalf("wanted connection %s\ngot: %s", conn.ID, message.ConnectionID)
		}
		if message.FrameCount != 1 {
			t.Fatalf("wanted frame count 1\ngot: %d", message.FrameCount)
		}
	})
}

// newWebSocketUpstream starts an origin that accepts a WebSocket upgrade,
// sends greeting as one unmasked text frame and then reads until the peer
// goes away.
func newWebSocketUpstream(t *testing.T, greeting string) *httptest.Server {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		connection, buffered, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer connection.Close()
		accept := sha1.Sum([]byte(req.Header.Get("Sec-WebSocket-Key") + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
		fmt.Fprintf(buffered, "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: %s\r\n\r\n",
			base64.StdEncoding.EncodeToString(accept[:]))
		buffered.Write([]byte{0x81, byte(len(greeting))})
		buffered.WriteString(greeting)
		buffered.Flush()
		_, _ = io.Copy(io.Discard, buffered)
	}))
	t.Cleanup(upstream.Close)
	return upstream
}

// upgradeThroughApp opens a WebSocket to upstream through the app's proxy
// listener and keeps the client connection open until the test ends.
func upgradeThroughApp(t *testing.T, app *App, upstream *httptest.Server) {
	t.Helper()
	client, err := net.Dial("tcp", listenerAddress(t, app))
	if err != nil {
		t.Fatalf("dialing proxy: %v", err)
	}
	t.Cleanup(func() { client.Close() })
	if err := client.SetDeadline(time.Now().Add(10 * time.Second)); err != nil {
		t.Fatalf("setting client deadline: %v", err)
	}
	host := strings.TrimPrefix(upstream.URL, "http://")
	request := fmt.Sprintf("GET %s/socket HTTP/1.1\r\nHost: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
		upstream.URL, host)
	if _, err := io.WriteString(client, request); err != nil {
		t.Fatalf("writing upgrade request: %v", err)
	}
	response, err := http.ReadResponse(bufio.NewReader(client), nil)
	if err != nil {
		t.Fatalf("reading handshake response: %v", err)
	}
	if response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("wanted 101\ngot: %d", response.StatusCode)
	}
}

func waitForEvent(t *testing.T, events *recordedEvents, name string) []any {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if data, ok := events.first(name); ok {
			if len(data) == 0 {
				t.Fatalf("wanted %s event data, got none", name)
			}
			return data
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s event", name)
	return nil
}
