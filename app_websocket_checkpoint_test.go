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

	"github.com/google/uuid"
	"github.com/tfkr-ae/marasi/domain"
	marasiws "github.com/tfkr-ae/marasi/websocket"
)

func TestAppWebSocketCheckpointWholeMessages(t *testing.T) {
	t.Run("should forward a held fragmented message with an edited payload and drop the next one", func(t *testing.T) {
		// The upstream sends two messages of two frames each, then "after".
		upstream := newFramesUpstream(t,
			marasiws.Frame{Fin: false, Opcode: marasiws.OpText, Payload: []byte("first ")},
			marasiws.Frame{Fin: true, Opcode: marasiws.OpContinuation, Payload: []byte("message")},
			marasiws.Frame{Fin: false, Opcode: marasiws.OpText, Payload: []byte("second ")},
			marasiws.Frame{Fin: true, Opcode: marasiws.OpContinuation, Payload: []byte("message")},
			marasiws.Frame{Fin: true, Opcode: marasiws.OpText, Payload: []byte("after")},
		)
		app := newScratchpadApp(t)
		events := &recordedEvents{}
		app.emitEvent = events.emit
		if err := app.StartProxy("127.0.0.1", "0"); err != nil {
			t.Fatalf("starting listener: %v", err)
		}
		app.SetWSIntercept(true)
		client, requestID := dialWebSocketThroughApp(t, app, upstream)

		first := waitForHeldMessage(t, app, requestID, uuid.Nil)
		if string(first.Payload) != "first message" || first.FrameCount != 2 {
			t.Fatalf("wanted held %q in 2 frames\ngot: %q in %d frames", "first message", first.Payload, first.FrameCount)
		}
		if err := app.ForwardWSIntercepted(first.ID, marasiws.OpText, "edited"); err != nil {
			t.Fatalf("forwarding: %v", err)
		}

		second := waitForHeldMessage(t, app, requestID, first.ID)
		if string(second.Payload) != "second message" || second.FrameCount != 2 {
			t.Fatalf("wanted held %q in 2 frames\ngot: %q in %d frames", "second message", second.Payload, second.FrameCount)
		}
		app.SetWSIntercept(false)
		if err := app.DropWSIntercepted(second.ID); err != nil {
			t.Fatalf("dropping: %v", err)
		}

		for _, want := range []string{"edited", "after"} {
			frame, err := marasiws.ReadFrame(client)
			if err != nil {
				t.Fatalf("reading forwarded frame: %v", err)
			}
			if !frame.Fin || string(frame.Payload) != want {
				t.Fatalf("wanted one final frame %q\ngot: fin=%v %q", want, frame.Fin, frame.Payload)
			}
		}

		messages := waitForStoredMessages(t, app, requestID, 3)
		if string(messages[0].Payload) != "edited" || messages[0].FrameCount != 2 {
			t.Fatalf("wanted stored %q in 2 frames\ngot: %q in %d frames", "edited", messages[0].Payload, messages[0].FrameCount)
		}
		if dropped, _ := messages[1].Metadata["dropped"].(bool); !dropped {
			t.Fatalf("wanted the second message stored as dropped\ngot metadata: %v", messages[1].Metadata)
		}
	})
}

// newFramesUpstream starts an origin that accepts a WebSocket upgrade, writes
// frames unmasked and then reads until the peer goes away.
func newFramesUpstream(t *testing.T, frames ...marasiws.Frame) *httptest.Server {
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
		for _, frame := range frames {
			if err := marasiws.WriteFrame(buffered, frame, false); err != nil {
				return
			}
		}
		buffered.Flush()
		_, _ = io.Copy(io.Discard, buffered)
	}))
	t.Cleanup(upstream.Close)
	return upstream
}

// dialWebSocketThroughApp upgrades to upstream through the app's listener and
// returns the client side, positioned after the handshake response, and the
// upgrade request's ID.
func dialWebSocketThroughApp(t *testing.T, app *App, upstream *httptest.Server) (io.Reader, uuid.UUID) {
	t.Helper()
	conn, err := net.Dial("tcp", listenerAddress(t, app))
	if err != nil {
		t.Fatalf("dialing proxy: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	if err := conn.SetDeadline(time.Now().Add(10 * time.Second)); err != nil {
		t.Fatalf("setting client deadline: %v", err)
	}
	host := strings.TrimPrefix(upstream.URL, "http://")
	request := fmt.Sprintf("GET %s/socket HTTP/1.1\r\nHost: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
		upstream.URL, host)
	if _, err := io.WriteString(conn, request); err != nil {
		t.Fatalf("writing upgrade request: %v", err)
	}
	reader := bufio.NewReader(conn)
	response, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatalf("reading handshake response: %v", err)
	}
	if response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("wanted 101\ngot: %d", response.StatusCode)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		for _, pending := range app.Proxy.GetPendingWebSocketInterceptions() {
			return reader, pending.RequestID
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("timed out waiting for a held message")
	return nil, uuid.Nil
}

// waitForHeldMessage waits until the app's Checkpoint holds a message for
// requestID other than previous.
func waitForHeldMessage(t *testing.T, app *App, requestID, previous uuid.UUID) *domain.WebSocketMessage {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if held := app.GetWSIntercepted(requestID); held != nil && held.ID != previous {
			return held
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("timed out waiting for a held message")
	return nil
}

func waitForStoredMessages(t *testing.T, app *App, requestID uuid.UUID, n int) []*domain.WebSocketMessage {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		messages, err := app.GetWebSocketMessages(requestID)
		if err == nil && len(messages) >= n {
			return messages
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %d stored messages", n)
	return nil
}
