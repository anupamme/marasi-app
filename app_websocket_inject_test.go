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

func TestAppInjectWebSocketMessage(t *testing.T) {
	tests := []struct {
		name           string
		neverCompress  bool
		wantCompressed bool
	}{
		{name: "should compress an injected text message on a deflate connection by default", neverCompress: false, wantCompressed: true},
		{name: "should send an injected text message uncompressed when never-compress is set", neverCompress: true, wantCompressed: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			upstream := newDeflateWebSocketUpstream(t)
			app := newScratchpadApp(t)
			events := &recordedEvents{}
			app.emitEvent = events.emit
			if err := app.StartProxy("127.0.0.1", "0"); err != nil {
				t.Fatalf("starting listener: %v", err)
			}

			upgradeThroughAppOffering(t, app, upstream, "permessage-deflate")

			openData := waitForEvent(t, events, "ws-open")
			conn := openData[0].(domain.WebSocketConnection)
			if conn.Deflate == nil {
				t.Fatalf("wanted the connection to negotiate permessage-deflate")
			}

			payload := strings.Repeat("compress me ", 50)
			if err := app.InjectWebSocketMessage(conn.RequestID, "client", 1, payload, tt.neverCompress); err != nil {
				t.Fatalf("injecting: %v", err)
			}

			injected := waitForInjectedMessage(t, events)
			if string(injected.Payload) != payload {
				t.Fatalf("wanted payload %q\ngot: %q", payload, injected.Payload)
			}
			if injected.Compressed != tt.wantCompressed {
				t.Fatalf("wanted Compressed %v\ngot: %v", tt.wantCompressed, injected.Compressed)
			}
		})
	}
}

// newDeflateWebSocketUpstream starts an origin that accepts a WebSocket
// upgrade with permessage-deflate and then reads until the peer goes away.
func newDeflateWebSocketUpstream(t *testing.T) *httptest.Server {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		connection, buffered, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer connection.Close()
		accept := sha1.Sum([]byte(req.Header.Get("Sec-WebSocket-Key") + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
		fmt.Fprintf(buffered, "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: %s\r\nSec-WebSocket-Extensions: permessage-deflate\r\n\r\n",
			base64.StdEncoding.EncodeToString(accept[:]))
		buffered.Flush()
		_, _ = io.Copy(io.Discard, buffered)
	}))
	t.Cleanup(upstream.Close)
	return upstream
}

// upgradeThroughAppOffering opens a WebSocket to upstream through the app's
// proxy listener, offering the given Sec-WebSocket-Extensions value, and
// keeps the client connection open until the test ends.
func upgradeThroughAppOffering(t *testing.T, app *App, upstream *httptest.Server, extensions string) {
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
	request := fmt.Sprintf("GET %s/socket HTTP/1.1\r\nHost: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Extensions: %s\r\n\r\n",
		upstream.URL, host, extensions)
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

// waitForInjectedMessage returns the first ws-message whose metadata marks it
// as injected.
func waitForInjectedMessage(t *testing.T, events *recordedEvents) domain.WebSocketMessage {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		events.mu.Lock()
		for i, name := range events.names {
			if name != "ws-message" || len(events.data[i]) == 0 {
				continue
			}
			message, ok := events.data[i][0].(domain.WebSocketMessage)
			if ok && message.Metadata["injected"] == true {
				events.mu.Unlock()
				return message
			}
		}
		events.mu.Unlock()
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timed out waiting for an injected ws-message")
	return domain.WebSocketMessage{}
}
