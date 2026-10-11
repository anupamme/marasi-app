package main

import (
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/tfkr-ae/marasi/domain"
	marasiws "github.com/tfkr-ae/marasi/websocket"
)

func TestAppWebSocketProgress(t *testing.T) {
	t.Run("should emit ws-progress while a fragmented message arrives, then its ws-message", func(t *testing.T) {
		fragment := strings.Repeat("x", 64*1024)
		upstream := newFragmentingUpstream(t, fragment, 4, 150*time.Millisecond)
		app := newScratchpadApp(t)
		events := &recordedEvents{}
		app.emitEvent = events.emit
		if err := app.StartProxy("127.0.0.1", "0"); err != nil {
			t.Fatalf("starting listener: %v", err)
		}

		upgradeThroughApp(t, app, upstream)

		messageData := waitForEvent(t, events, "ws-message")
		message, ok := messageData[0].(domain.WebSocketMessage)
		if !ok {
			t.Fatalf("wanted ws-message data domain.WebSocketMessage\ngot: %T", messageData[0])
		}
		if message.FrameCount != 4 {
			t.Fatalf("wanted frame count 4\ngot: %d", message.FrameCount)
		}

		var progress []domain.WebSocketMessageProgress
		for _, recorded := range eventsBefore(events, "ws-message") {
			if recorded.name != "ws-progress" {
				continue
			}
			record, ok := recorded.data[0].(domain.WebSocketMessageProgress)
			if !ok {
				t.Fatalf("wanted ws-progress data domain.WebSocketMessageProgress\ngot: %T", recorded.data[0])
			}
			progress = append(progress, record)
		}
		if len(progress) == 0 {
			t.Fatal("wanted at least one ws-progress event before the ws-message")
		}
		first := progress[0]
		if first.MessageID != message.ID {
			t.Fatalf("wanted progress message id %s\ngot: %s", message.ID, first.MessageID)
		}
		if first.ConnectionID != message.ConnectionID || first.RequestID != message.RequestID {
			t.Fatalf("wanted progress for connection %s request %s\ngot: connection %s request %s",
				message.ConnectionID, message.RequestID, first.ConnectionID, first.RequestID)
		}
		if first.Direction != "server" || first.Opcode != marasiws.OpBinary {
			t.Fatalf("wanted server binary progress\ngot: direction %q opcode %d", first.Direction, first.Opcode)
		}
		last := progress[len(progress)-1]
		if last.Bytes <= 0 || last.Frames < 1 || last.Bytes >= int64(4*len(fragment)) {
			t.Fatalf("wanted partial progress below %d bytes\ngot: %d bytes, %d frames", 4*len(fragment), last.Bytes, last.Frames)
		}
	})
}

type recordedEvent struct {
	name string
	data []any
}

// eventsBefore returns the events recorded before the first event called
// name, in the order they were emitted.
func eventsBefore(events *recordedEvents, name string) []recordedEvent {
	events.mu.Lock()
	defer events.mu.Unlock()
	var before []recordedEvent
	for i, recorded := range events.names {
		if recorded == name {
			break
		}
		before = append(before, recordedEvent{name: recorded, data: events.data[i]})
	}
	return before
}

// newFragmentingUpstream starts an origin that accepts a WebSocket upgrade and
// sends one binary message as frames fragments of payload, pausing between
// them so Marasi reports progress.
func newFragmentingUpstream(t *testing.T, payload string, frames int, pause time.Duration) *httptest.Server {
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
		buffered.Flush()
		for i := range frames {
			opcode := marasiws.OpContinuation
			if i == 0 {
				opcode = marasiws.OpBinary
			}
			frame := marasiws.Frame{Fin: i == frames-1, Opcode: opcode, Payload: []byte(payload)}
			if err := marasiws.WriteFrame(connection, frame, false); err != nil {
				return
			}
			time.Sleep(pause)
		}
		_, _ = io.Copy(io.Discard, buffered)
	}))
	t.Cleanup(upstream.Close)
	return upstream
}
