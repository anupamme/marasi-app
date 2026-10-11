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
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/tfkr-ae/marasi/domain"
)

func TestAppWebSocketConnectionDetails(t *testing.T) {
	offers := []string{"x-webkit-deflate-frame, permessage-deflate; client_max_window_bits", "permessage-deflate"}
	accepts := []string{"permessage-deflate; server_no_context_takeover; client_max_window_bits=10"}
	wantDeflate := &domain.WebSocketDeflate{ServerNoContextTakeover: true, ServerMaxWindowBits: 15, ClientMaxWindowBits: 10}
	wantRemoved := []string{"x-webkit-deflate-frame"}

	t.Run("should carry Deflate and RemovedExtensions in ws-open and the connection getter", func(t *testing.T) {
		upstream := newNegotiatingUpstream(t, accepts)
		app := newScratchpadApp(t)
		events := &recordedEvents{}
		app.emitEvent = events.emit
		if err := app.StartProxy("127.0.0.1", "0"); err != nil {
			t.Fatalf("starting listener: %v", err)
		}

		upgradeThroughAppOffering(t, app, upstream, offers)

		conn, ok := waitForEvent(t, events, "ws-open")[0].(domain.WebSocketConnection)
		if !ok {
			t.Fatal("wanted ws-open data domain.WebSocketConnection")
		}
		if !reflect.DeepEqual(conn.Deflate, wantDeflate) {
			t.Fatalf("ws-open Deflate\nwanted: %+v\ngot: %+v", wantDeflate, conn.Deflate)
		}
		if !reflect.DeepEqual(conn.RemovedExtensions, wantRemoved) {
			t.Fatalf("ws-open RemovedExtensions\nwanted: %q\ngot: %q", wantRemoved, conn.RemovedExtensions)
		}

		// Marasi stores the record asynchronously after ws-open.
		got := waitForConnection(t, app, conn, func(c *domain.WebSocketConnection) bool { return c.Deflate != nil })
		if got.State != "open" {
			t.Fatalf("wanted state %q\ngot: %q", "open", got.State)
		}
		if !reflect.DeepEqual(got.Deflate, wantDeflate) {
			t.Fatalf("getter Deflate\nwanted: %+v\ngot: %+v", wantDeflate, got.Deflate)
		}
		if !reflect.DeepEqual(got.RemovedExtensions, wantRemoved) {
			t.Fatalf("getter RemovedExtensions\nwanted: %q\ngot: %q", wantRemoved, got.RemovedExtensions)
		}
	})

	t.Run("should keep returning the connection's details from the getter after it closes", func(t *testing.T) {
		upstream := newNegotiatingUpstream(t, accepts)
		app := newScratchpadApp(t)
		events := &recordedEvents{}
		app.emitEvent = events.emit
		if err := app.StartProxy("127.0.0.1", "0"); err != nil {
			t.Fatalf("starting listener: %v", err)
		}

		client := upgradeThroughAppOffering(t, app, upstream, offers)
		conn := waitForEvent(t, events, "ws-open")[0].(domain.WebSocketConnection)
		client.Close()
		waitForEvent(t, events, "ws-close")

		got := waitForConnection(t, app, conn, func(c *domain.WebSocketConnection) bool { return c.State != "open" })
		if !reflect.DeepEqual(got.Deflate, wantDeflate) {
			t.Fatalf("getter Deflate\nwanted: %+v\ngot: %+v", wantDeflate, got.Deflate)
		}
		if !reflect.DeepEqual(got.RemovedExtensions, wantRemoved) {
			t.Fatalf("getter RemovedExtensions\nwanted: %q\ngot: %q", wantRemoved, got.RemovedExtensions)
		}
	})

	t.Run("should report no Deflate when the upstream accepts no extension", func(t *testing.T) {
		upstream := newNegotiatingUpstream(t, nil)
		app := newScratchpadApp(t)
		events := &recordedEvents{}
		app.emitEvent = events.emit
		if err := app.StartProxy("127.0.0.1", "0"); err != nil {
			t.Fatalf("starting listener: %v", err)
		}

		upgradeThroughAppOffering(t, app, upstream, []string{"permessage-deflate"})

		conn := waitForEvent(t, events, "ws-open")[0].(domain.WebSocketConnection)
		if conn.Deflate != nil {
			t.Fatalf("wanted no Deflate\ngot: %+v", conn.Deflate)
		}
		if len(conn.RemovedExtensions) != 0 {
			t.Fatalf("wanted no removed extensions\ngot: %q", conn.RemovedExtensions)
		}
	})
}

// waitForConnection polls the app's connection getter for conn until ready
// accepts the result, and fails the test after five seconds.
func waitForConnection(t *testing.T, app *App, conn domain.WebSocketConnection, ready func(*domain.WebSocketConnection) bool) *domain.WebSocketConnection {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	var got *domain.WebSocketConnection
	for time.Now().Before(deadline) {
		got = app.GetWebSocketConnection(conn.RequestID)
		if got != nil && ready(got) {
			return got
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for the connection from the getter\nlast: %+v", got)
	return nil
}

// newNegotiatingUpstream starts an origin that accepts a WebSocket upgrade
// with one Sec-WebSocket-Extensions line per accept value, then reads until
// the peer goes away.
func newNegotiatingUpstream(t *testing.T, accepts []string) *httptest.Server {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		connection, buffered, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer connection.Close()
		accept := sha1.Sum([]byte(req.Header.Get("Sec-WebSocket-Key") + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
		fmt.Fprintf(buffered, "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: %s\r\n",
			base64.StdEncoding.EncodeToString(accept[:]))
		for _, value := range accepts {
			fmt.Fprintf(buffered, "Sec-WebSocket-Extensions: %s\r\n", value)
		}
		buffered.WriteString("\r\n")
		buffered.Flush()
		_, _ = io.Copy(io.Discard, buffered)
	}))
	t.Cleanup(upstream.Close)
	return upstream
}

// upgradeThroughAppOffering opens a WebSocket to upstream through the app's
// proxy listener, offering the given extensions, and returns the client
// connection. The connection is closed when the test ends.
func upgradeThroughAppOffering(t *testing.T, app *App, upstream *httptest.Server, offers []string) net.Conn {
	t.Helper()
	client, err := net.Dial("tcp", listenerAddress(t, app))
	if err != nil {
		t.Fatalf("dialing proxy: %v", err)
	}
	t.Cleanup(func() { client.Close() })
	if err := client.SetDeadline(time.Now().Add(10 * time.Second)); err != nil {
		t.Fatalf("setting client deadline: %v", err)
	}
	var request strings.Builder
	fmt.Fprintf(&request, "GET %s/socket HTTP/1.1\r\nHost: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n",
		upstream.URL, strings.TrimPrefix(upstream.URL, "http://"))
	for _, offer := range offers {
		fmt.Fprintf(&request, "Sec-WebSocket-Extensions: %s\r\n", offer)
	}
	request.WriteString("\r\n")
	if _, err := io.WriteString(client, request.String()); err != nil {
		t.Fatalf("writing upgrade request: %v", err)
	}
	response, err := http.ReadResponse(bufio.NewReader(client), nil)
	if err != nil {
		t.Fatalf("reading handshake response: %v", err)
	}
	if response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("wanted 101\ngot: %d", response.StatusCode)
	}
	return client
}
