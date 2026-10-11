# Request interception

## Sub-features

- Lua interception rules for requests and responses
- Global HTTP intercept enable/disable state
- Edit, forward, and drop actions
- HTTP intercepted items, including dropped WebSocket upgrade responses
- The WebSocket modal's Checkpoint tab: a separate per-connection message queue

## How to get to it (user POV)

Select the rail item titled `Checkpoint` or press `Command+4`. The page shows `Intercept Queue: N` or `No items in interception queue`, and the buttons `Forward`, `Intercept Response` (requests only), `Global Intercept (On)`/`Global Intercept (Off)`, and `Drop`. `Checkpoint Settings` holds the Lua rules editor and an `Update Intercept Rules` button.

Palette commands and shortcuts:

| Command | Shortcut |
| --- | --- |
| `Toggle Checkpoint Settings` | `⌘P` |
| `Edit Checkpoint` | `⌘⇧E` |
| `Update Checkpoint Code` | `⌘⇧R` |
| `Edit Intercepted Item` | `⌘⇧I` |
| `Forward Intercepted Item` | `⌘⇧F` |
| `Drop Intercepted Item` | `⌘⇧D` |
| `Show Logs` | `⌘⇧L` |

Global `⌘+I` toggles global intercept.

Shortcuts: every menu shortcut for this feature is a catalog action in context `checkpoint` (and the WebSocket modal's `websocket.checkpoint` tab) in `frontend/src/lib/keybindings/catalog.js`; the Marasi menu (`⌘K`) on the page lists them with their current keys.

## Driving it with Chrome CDP

Run `scripts/drive.sh checkpoint` for route proof. Its marker is `Checkpoint Settings`, because the rail label `Checkpoint` is always visible. Proven sequence, with `Global Intercept` left off:

```json
{"name":"narrow-rule","steps":[
 {"text":"Checkpoint Settings"},{"waitSelector":"div[data-language=lua]"},{"waitText":"interceptRequest"},
 {"click":"div[data-language=lua]"},{"key":"cmd+a"},
 {"insert":"function interceptRequest(request)\nreturn request:path() == \"/checkpoint-probe\"\nend\nfunction interceptResponse(response)\nreturn false\nend\nfunction interceptWebSocketMessage(message)\nreturn false\nend"},
 {"text":"Update Intercept Rules"},{"waitText":"Updated checkpoint rules"},
 {"text":"Checkpoint Settings"},{"waitNoSelector":"div[data-language=lua]"}]}
```

Start the matching request in the background and record its timing, for example `curl -w 'status=%{http_code} at=%{time_total}s' -x … /checkpoint-probe &`. Then drive:

```json
{"name":"hold-and-forward","steps":[
 {"waitText":"Intercept Queue: 1"},{"waitText":"/checkpoint-probe"},{"waitText":"No Error"},
 {"text":"Forward"},{"waitText":"No items in interception queue"}]}
```

The sender must finish only after the forward.

### WebSocket upgrade drop

Narrow `interceptResponse` to the upgrade path (`return response:request():path() == "/ws-drop"`), start the upgrade, wait for the `101` response in the queue, and click `Drop`. The Ledger row then shows the neutral slashed icon titled `Upgrade response dropped` and cannot open a stream (see [ledger.md](ledger.md)). Drop the response, not the request: a dropped request never reaches the response pipeline, so it does not set `dropped`.

### WebSocket Checkpoint tab

Open the upgrade's WebSocket modal from the Ledger and select `Checkpoint`. The toolbar shows `Queue empty`, `1 message queued`, or `N messages queued`, and the buttons `Forward` (`⌘⇧F`, `Forward WebSocket Message`), `Intercept On`/`Intercept Off` (`⌘⇧I`, `Toggle WebSocket Intercept`), and `Drop` (`⌘⇧D`, `Drop WebSocket Message`). An empty queue reads `No WebSocket messages in the interception queue`. A held message shows its direction (`Client to server`/`Server to client`), opcode, time, the same properties grid as Stream, and an editable payload.

Prove each path on one connection: turn `Intercept On`, send a message, then forward one unchanged, edit and forward another (the peer receives the edit), and drop a third. In Stream, forwarded rows read `Forwarded intercepted message` on hover and the dropped row is struck through with the `Dropped` flag. Turn `Intercept Off` afterwards.

## Gotchas

- Broad rules can hold unrelated traffic. Use a unique verification host or path.
- `Global Intercept` holds every HTTP request and response regardless of a narrow Lua rule, but only while the checkpoint extension is enabled.
- To verify `Edit Intercepted Item` (`⌘⇧I`), queue a request, click `No Error` to move focus away from the editor, send the shortcut, and wait for `.cm-content:focus`. Repeat with Syntax Mode set to Disabled, then restore the setting. With an empty queue, the command should leave focus unchanged.
- Parse errors arrive asynchronously after each edit. Wait for `No Error` before `Forward`.
- The queue view refreshes on the next `intercepted` event, after its own Forward or Drop, or on a remount. Items removed elsewhere stay visible until then.
- A request left intercepted can keep clients waiting during cleanup.
- WebSocket interception has its own `Intercept On`/`Intercept Off` toggle, independent of `Global Intercept`; both need the checkpoint extension enabled. The toggle is process-global and holds every message on every connection; queues are per connection. With it off, `interceptWebSocketMessage` in the Lua rules decides.
