# Traffic ledger

## Sub-features

- HTTP request/response rows, and WebSocket upgrade rows whose badges column shows the upgrade state
- The WebSocket modal opened from an upgrade: Stream, Checkpoint, Inject, and Connection tabs
- Indexed query search, content-type exclusions, and loading older query pages on scroll
- Request detail in the drawer, notes, highlights, and handoff to Launchpad, Armory, or Logbook

## How to get to it (user POV)

Select the rail item titled `Ledger` or press `Command+2`. The page is the sitemap dock (`.lp-dock`, strip `.lp-strip` labelled `Sitemap` when collapsed; `⌘\` toggles it), a one-row toolbar (`.ledger-toolbar`) with `#searchBox` (placeholder `Search traffic…`) and a `Types` button (`.ledger-types > button`) whose panel holds the input with placeholder `Filter by Content Type`, the windowed table (`.ledger-table`, rows `.ledger-row`, columns `# · badges · Time · Method · Host · Path · Status · Type · Size`), and the status bar (`.ledger-status`: `N in the live view` or `N matching`, `N hidden by type`, `Request N selected` with `Clear`). Only the rows in view are in the DOM.

Shortcuts: every menu shortcut for this feature is a catalog action in context `ledger.drawer-closed`, `ledger.drawer-open` and `ledger.drawer-open.websocket` (and, in the WebSocket modal, `websocket` plus `websocket.<tab>`) in `frontend/src/lib/keybindings/catalog.js`; the Marasi menu (`⌘K`) on the page lists them with their current keys. The drawer contexts follow the Ledger store's drawer (`state.ledgerDrawer` in the layout's shortcut state), not Skeleton's drawer.

## Driving it with Chrome CDP

Run `scripts/drive.sh ledger` for route proof. For capture, send a `text/html` request with a unique path through the isolated proxy (`curl -x http://127.0.0.1:18080 …` to a local disposable server), then wait for that path in the table:

```bash
scripts/drive.sh ledger steps '{"name":"capture","steps":[{"waitText":"/ledger-second"}]}'
```

Pair it with a read-only query: `sqlite3 -readonly <project> "select method, host, path, status_code, content_type from request"`.

Search supports field expressions and boolean operators, not just a table substring filter. A proven sequence:

```json
{"name":"search","steps":[
 {"click":"#searchBox"},{"key":"cmd+a"},
 {"insert":"response_body:\"ledger-second\""},{"key":"enter"},
 {"waitSelector":"#ledgerQueryMatchCount"},{"waitText":"1 match"},{"waitText":"1 matching"},
 {"waitNoText":"/ledger-first"},{"waitText":"/ledger-second"},
 {"click":"[aria-label=\"Clear query\"]"},{"waitText":"/ledger-first"}]}
```

The query stays active across navigation until cleared, so the recipe clears it; otherwise later recipes cannot find rows the query excludes.

Enter runs the query at once. Typing alone runs it after a 700 ms debounce. `#ledgerQueryMatchCount` reads `1 match`, `N matches`, or `N+ matches` while older pages remain. The query-help toggle describes the supported fields, operators, and examples. Bare text searches the request, response, note, and metadata, and needs at least three characters; punctuation can require quoting.

For handoff, click a row with `{"click":".ledger-row","hasText":"<path>"}`, wait for `.ledger-drawer` (below the table, request and response side by side), then use the drawer's shortcuts. For example, `cmd+l` sends the selection to a new launchpad and shows `Request N sent to a new launchpad` (`N requests …` for several) with a `Jump to Launchpad` action. `cmd+shift+e` maximises the drawer over the table (`.ledger-table` leaves the DOM) and restores it; `cmd+shift+]`/`[` move the selection; `escape`, the status bar's `Clear`, or the drawer's `Close the drawer` button closes it. Drag `.ledger-drawer-resize` to resize it. The selection, the drawer's height and maximised state, and the dock's width and collapsed state survive leaving and returning to the Ledger, so close the drawer at the end of a recipe.

**Selection and the row menu.** Pressing a row selects it alone; dragging across rows sweeps them; `⌘`-click toggles, `⇧`-click selects from the anchor, `⌘⇧`-click adds that range (`drive.sh` clicks carry no modifiers, so prove ranges with keys). With the table focused, `shift+arrowdown`/`shift+arrowup` extend from the anchor, `cmd+a` selects every loaded row, and `escape` clears. Selected rows carry `aria-selected="true"`; the focused one, which the drawer shows, is outlined. The status bar reads `Request N selected`, `N selected`, or `All N selected` (`#ledgerSelectionCount`). Right-click a row (`{"click":".ledger-row","hasText":"<path>","button":"right"}`; a selected row keeps the selection) or press `cmd+.` to open `.ledger-row-menu`: a header summing up the selection, a `Type an action…` filter (`.ledger-row-menu-filter`, which searches submenus too), then items `[data-menu-item=<id>]` (`open`, `websocket`, `launchpad`, `armory`, `finding`, `testcase`, `note`, `copy`, `narrow`, `select`, `metadata`). Submenus open in `.ledger-row-submenu`. Keys: arrows move, `arrowright`/`enter` open a submenu, `arrowleft` goes back, `enter` runs, `escape` closes. Each change reports through a toast (`Linked 2 requests to finding "…"`, `Selected N requests`, `Narrowed the query: …`, `Copied 2 URLs`). Shortcuts with a selection: `⌘L` new launchpad, `⌘⇧A` Armory, `⌘⇧F` new finding, `⌘⇧T` new test case, `⌘N` note, `⌘⇧C` copy URLs, `⌘M` metadata, `⌘.` the menu.

## WebSocket streams

A WebSocket message is the whole message, however many frames it arrived in. UI text says "message"; action ids keep `frame` (`websocket.stream.next-frame`, `websocket.checkpoint.forward-frame`, `websocket.inject.inject-frame`).

Drive a WebSocket through the proxy with a raw-socket client: send an absolute-form upgrade (`GET http://127.0.0.1:<port>/<path> HTTP/1.1` with `Upgrade: websocket`, `Connection: Upgrade`, `Sec-WebSocket-Key`, `Sec-WebSocket-Version: 13`) to `127.0.0.1:18080`, then read and write masked frames. Use a disposable local server you control, so each state below is a deliberate server behaviour. Offer `Sec-WebSocket-Extensions: permessage-deflate` to get a deflate connection; add another offer (for example `x-webkit-deflate-frame`) to see it stripped.

**Upgrade states.** The badges column shows a WebSocket icon (its label is the badge's `title` and `aria-label`; past three badges, hover the `+N` slot `.ledger-badges-more` for the full list) whose state comes from `frontend/src/lib/websocket/presentation.js`:

| `websocket.state` | Icon | Opens a stream | How to produce it |
| --- | --- | --- | --- |
| `pending` | warning | yes | Hold the server's 101 response |
| `open` | success | yes | Complete the handshake |
| `closed` (or no state) | error | yes | Close the connection from either side |
| `failed` | error, slashed; tooltip `WebSocket handshake failed — see the logs on Home` | no | Offer `permessage-deflate` and have the server answer an extension response that matches no offer (for example `permessage-deflate; server_max_window_bits=20`, or two extensions). Home's logs get `WebSocket handshake failed: …` |
| `dropped` | neutral, slashed; tooltip `Upgrade response dropped` | no | Drop the 101 response in Checkpoint (see [checkpoint.md](checkpoint.md)) |

A failed or dropped upgrade reaches the Ledger live through `ws-state`, with no reload. A slashed row has no drawer `WebSocket` button, and `ledger.drawer-open.websocket` is ineligible, so `⌘⇧O` stays the drawer's `Open Request`. Prove the tooltip with `[title="Upgrade response dropped"]` or the failed text.

**Opening the modal.** Open the upgrade row's drawer and click its `WebSocket` button, or press `Open WebSocket Stream` (`⌘⇧O`; it closes the modal again on every tab but Inject, which binds `⌘⇧O` itself). The header shows `<transport>://<host><path>`, `N messages`, and `Close Connection` (`⌘⇧X`, toast `WebSocket connection closed`, disabled unless the state is open). Tabs, in `⌘[`/`⌘]` order: `Stream`, `Checkpoint`, `Inject`, `Connection`. Each tab's context is `websocket.stream`, `websocket.checkpoint`, `websocket.inject`, or `websocket.connection`; the Connection tab binds no actions of its own.

**Progress chip.** While a message is still arriving, the header shows `↓ receiving <size> · <n> frames` (`↑` for client to server), titled `A message is still arriving; it appears in Stream once its last frame is in`. Produce it with a fragmented message whose frames arrive more than 100 ms apart (Marasi emits progress at most every 100 ms): send a text frame with FIN clear, then continuations a second apart, then the final frame. The chip clears when the message lands in Stream, or when Checkpoint holds it.

**Stream.** Selecting a row shows the properties grid above the payload: `Type`, `Direction` (`client → server`/`server → client`, plus `(sent by Marasi)` on Marasi's own closes), `Size`, `Frames`, `Compressed` (`yes`/`no`), `Flags`, and a `Note` when the payload shown is not the message. Buttons: `Metadata`/`View Message` (`⌘⇧M`) and `Copy to Inject` (`⌘⇧I`, toast `Copied to Inject`). Flags, their row edge, and how to produce them:

| Flag | Edge | Produce it |
| --- | --- | --- |
| `Proxy` | warning | Any close Marasi sends, for example after `Too large` |
| `Too large` | error | Add `websocket_max_message_size: 1024` to `marasi_config.yaml` in the isolated config directory, run `scripts/restart.sh`, then send a 2 KB message. Marasi closes with 1009 to the sender and 1001 to the receiver; `Size` reads `> <size seen>` |
| `Corrupt` | error | On a deflate connection, send an RSV1 frame whose payload is not valid deflate (close 1007) |
| `Cut short` | error | Start a fragmented message and drop the TCP connection before its final frame |
| `Bad close` | error | Send a close frame with an invalid code or a 1-byte payload |
| `Dropped` | strike-through, no edge | Drop it in the Checkpoint tab |
| `Injected` | tertiary text | Inject it from the Inject tab |

Hover a row to read `<label>: <flag tooltip>` lines; a forwarded interception reads `Forwarded intercepted message`.

**Inject.** `Direction` (`Client to server`/`Server to client`, `⌘⇧D`), `Opcode` (`Text`, `Binary`, `Close`, `Ping`, `Pong`, `⌘⇧O`), and `Inject` (`⌘⇧Enter`, toast `WebSocket message injected`) beside a `Connection Open`/`Connection Closed` chip. On a deflate connection with `Text` or `Binary`, a `Send uncompressed` checkbox appears under the toolbar. Prove both choices: inject once with it clear and once checked, then check the injected rows' `Compressed` reads `yes` and `no`.

**Connection.** Read-only: `URL`, `State` chip, `Close` (`<code> <reason>`, with `— closed by Marasi` in warning colour when any stored message is a Marasi close), a `Compression` section (`Extension` `permessage-deflate` with client/server context takeover and max window rows, `none negotiated`, or `not recorded` without a connection record), and `Stripped by Marasi` with one `Offer` row per stripped extension or `none`.

## Gotchas

- `#searchBox` is always in the toolbar. The content-type chips mount only while the `Types` panel is open: open it with `{"click":".ledger-types > button"}` (its text includes the exclusion count, so `{"text":"Types"}` fails) or `⌘⇧F`, which also focuses the chip input. A click outside the panel closes it; click `.ledger-status`, not the table, which would select a row. `⌘P` toggles the query fields panel; `⌘⇧S` focuses `#searchBox` (pressing it again blurs the box). `⌘]`/`⌘[` scroll the table a page.
- Clicking anywhere in `.ledger-table` selects the row under the pointer and opens the drawer, which swaps the shortcut context to `ledger.drawer-open` (`⌘⇧F` then creates a finding).
- Content-type chips exclude matching types. The defaults already hide images, fonts, media, JavaScript, CSS, PDF, archives, and office types. Use `text/html` for capture proof. They include `application/octet-stream`, which `python3 -m http.server` sends for extensionless paths, so serve a `.html` path.
- An empty Ledger only proves navigation. Complete capture proof needs traffic through the proxy.
- HTTPS traffic needs the verification instance's generated certificate.
- Search and filters can hide newly captured rows; record their values in evidence.
- The live view batches `request`/`response` events and flushes every 200 ms. The table lists the live view and query results newest first; headers don't sort yet. Matching traffic that arrives during a query is staged behind a button labelled `1 new match` or `N new matches`, which appears after the next 5 s poll.
- Content-type exclusions match stored values exactly, not MIME families. Inspect the actual saved chips rather than assuming defaults.
