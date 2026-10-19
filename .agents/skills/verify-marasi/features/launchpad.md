# Request replay

## Sub-features

- Launchpad dock: drag to resize, snap-collapse to a strip, auto-hide while editing
- Launchpad file tree: Launchpad entries windowed to the original plus the last 10, Group by status, Expand all / Collapse all, Latest-in button
- Search (names locally; entry heads and bodies through Marasi), create empty launchpad, rename and description
- Per-launchpad entry count and last status from Marasi's launchpad summary, updated live by launches
- Launchpad draft editor, HTTPS toggle, Launch, response display, unsaved-draft prompts
- Tracked launches (Marasi ADR-0031): pending state, Cancel, and each entry's outcome (completed, cancelled, failed with a reason)
- Compare two entries: A/B picking, quick picks, read-only CodeMirror MergeView with Request/Response tabs, chip re-pick, swap, Esc

## How to get to it (user POV)

Select the rail item titled `Launchpad` or press `Command+5`. The left dock holds the tree: a `Launchpads N` header with `Expand all` (`.lp-expand-all`), `Collapse all` (`.lp-collapse-all`) and `New launchpad` (+) buttons, a `Search launchpads` input, and a `Group by status` SlideToggle. A fresh project shows `No launchpads yet` in the tree and `No launchpad selected` in the workspace. Users add a launchpad from a Ledger request with `Send to Launchpad`: the row menu's `Send to Launchpad › New launchpad`, or `⌘⇧L` with a row selected. Both show `Sent 1 request to a new launchpad` (`Sent N requests …` for a multi-selection, which makes one launchpad named `N requests`) with a `Jump to Launchpad` action, or create an empty one with +.

Each launchpad row shows its name, a warning dot (`title="Unsaved draft"`) for a dirty Launchpad draft, a `+N` unseen badge for entries that arrived while it was not open, its entry count (`[title="Entries"]`), and its last status (`[title="Last status"]`, `…` while the newest entry awaits its response). Count and status come from `GetLaunchpads` (Marasi's `EntryCount`/`LastStatusCode`), so they show for launchpads that were never expanded; the page loads a launchpad's entries only when it opens (selected, expanded, Expand all, or listed by a search). A launch updates its launchpad's count and last status live. Under an open launchpad, entry rows (`.lp-entry`) show number, method, path, status and length; the first carries the original-entry icon. Lists longer than 11 show `N earlier entries` with `Show N more` and, past 50 hidden, `Show all`. The workspace top bar shows the name with a `Rename launchpad` pencil, `entry X of N`, `Revert draft` while dirty, the `HTTPS` toggle, `Launch`, and `Delete launchpad`. Below it, the request editor (`.lp-editor`) and the `Response` pane (`.lp-response`) sit side by side. The editor title (`.lp-request-title`) reads `Request`, and `Request draft` with the unsaved dot only while the draft is dirty. Expand all opens every launchpad (and every status folder while grouping); Collapse all closes them all, and the selected launchpad stays closed.

Shortcuts: every menu shortcut for this feature is a catalog action in context `launchpad` in `frontend/src/lib/keybindings/catalog.js`; the Marasi menu (`⌘K`) on the page lists them with their current keys. Factory keys: `⌘⇧S` search (expands the dock and focuses the search box), `⌘⇧A` new launchpad, `⌘R` rename (id `launchpad.toggle-settings`), `⌘\` toggle the dock, `⌘⇧G` Group by status, `⌘⇧↓` jump to latest, `⌘⇧C` start or close compare, `⌘⇧R` switch the compare Request/Response view (`launchpad.toggle-compare-view`), `⌘⇧X` swap A and B, `⌘]`/`⌘[` next/previous launchpad (ids `launchpad.next-tab`/`previous-tab`), `⌘⇧]`/`⌘⇧[` next/previous entry (moves B while comparing), `⌘⇧E` focus the request editor, `⌘⇧T` toggle HTTPS, `⌘⇧N` entry notes and `⌘⇧M` entry metadata (each opens `Entry N Notes`/`Entry N Metadata` and closes it again), `⌘⇧D` delete launchpad (`launchpad.delete-tab`), `⌘⇧L` launch, `⌘⇧.` cancel the pending launch (`launchpad.cancel-launch`; the driver sends `cmd+shift+.`). Like the Ledger, `/launchpad` lets modified shortcuts fire from its text fields: `⌘K` opens and closes the Marasi menu from the search box, the rename name and description inputs, and the create input (the create input stays open while the menu borrows focus, and focus returns to it on close). Fields keep Escape and Enter, and `⌘⇧↓` yields to a focused field or editor, so click `.lp-topbar` before it. The driver sends `cmd+\\` and `cmd+shift+down`.

```json
{"name":"shortcuts","steps":[
 {"key":"cmd+shift+a"},{"insert":"KB pad"},{"key":"cmd+k"},{"waitSelector":"#commandmenu"},{"key":"cmd+k"},{"waitNoSelector":"#commandmenu"},
 {"waitSelector":"input[aria-label=\"New launchpad name\"]:focus"},{"key":"enter"},{"waitText":"Empty launchpad"},
 {"click":".lp-topbar"},{"key":"cmd+\\"},{"waitSelector":".lp-strip"},
 {"key":"cmd+shift+s"},{"waitSelector":"input[aria-label=\"Search launchpads\"]:focus"},{"key":"escape"},
 {"click":".lp-topbar"},{"key":"cmd+r"},{"waitSelector":"input[aria-label=\"Launchpad name\"]"},{"key":"escape"}]}
```

`⌘⇧↓` always selects the open launchpad's newest entry, even in a short list, through the same path as a click (a dirty draft asks `Discard the draft?`), then opens its launchpad and status folder and scrolls it into view: with entry 1 of 3 selected, wait for `entry 3 of 3`. While that launchpad is being compared it only scrolls; A and B stay as picked. The floating `Latest in …` button only scrolls and never changes the selection. With two or more entries, `⌘⇧C` shows `click any entry in the sidebar`; after a quick pick, `⌘⇧R` flips `.lp-compare-strip button[aria-pressed="true"]` and `⌘⇧X` moves the A entry's number into `.lp-chip[data-side="right"]`. The tree scrolls smoothly; in headless Chrome the `Latest in …` button can stay in the DOM after the scroll, so check the screenshot rather than waiting for the text to go.

Seed a short launchpad without the Ledger: create it, turn HTTPS off, and Launch the draft once per entry (wait for `entry N of N` between launches). Marasi PR #28 removed the `x-launchpad-id` header, so proxied traffic with it no longer links to a launchpad.

## Driving it with Chrome CDP

Run `scripts/drive.sh launchpad` for route proof. It requires `Group by status`, which the dock paints on every visit (the dock always mounts expanded). A `launchpad` drive therefore fails while the dock is collapsed to its strip: expand it (or start the recipe before collapsing) first. Proven handoff from Ledger:

```json
{"name":"send-to-launchpad","steps":[
 {"click":".ledger-row","hasText":"/compass-allowed"},{"waitSelector":".ledger-drawer"},
 {"key":"cmd+shift+l"},{"waitText":"to a new launchpad"},
 {"text":"Jump to Launchpad"},{"waitPath":"/launchpad"},{"waitNoSelector":".ledger-drawer"},
 {"waitText":"Group by status"}]}
```

The Ledger keeps its selection, so its drawer is open again on the next Ledger visit; close it there before the next Ledger recipe.

Both Ledger paths, `⌘⇧L` with one row selected and the row menu's `Send to Launchpad › New launchpad`, create a launchpad named `Request N`, and their toast's `Jump to Launchpad` opens `/launchpad?id=<id>`. The page opens that launchpad, selects its newest entry, opens its row even after `Collapse all`, and scrolls it into view. The previously open launchpad is not reselected. This also works when the toast is clicked while `/launchpad` is already open. If the id no longer exists, the page shows `That launchpad no longer exists.` and keeps the current launchpad. Other launchpads can already show `entry 1 of 1`, so wait on the sent path instead:

```json
{"name":"right-click-jump","steps":[
 {"click":".ledger-row","hasText":"/seed-7","button":"right"},{"click":"[data-menu-item=launchpad]"},{"click":"[data-menu-item=lp-new]"},{"waitText":"to a new launchpad"},
 {"text":"Jump to Launchpad"},{"waitPath":"/launchpad"},
 {"waitText":"/seed-7","within":".lp-editor"},{"waitSelector":".lp-entry[aria-current=true]"}]}
```

Right-click only a row that is already in view, so the driver does not scroll the table under the open menu.

Then, on Launchpad, edit the draft and Launch:

```json
{"name":"edit-and-launch","steps":[
 {"click":"div[role=switch]:has(input[name=\"TLS Toggle\"])"},
 {"waitSelector":"div[role=switch][aria-checked=false]:has(input[name=\"TLS Toggle\"])"},
 {"click":".lp-editor .cm-content"},{"key":"cmd+a"},
 {"insert":"GET /launchpad-replay HTTP/1.1\nHost: 127.0.0.1:18099\n\n"},
 {"waitText":"Revert draft"},{"waitText":"Request draft","within":".lp-request-title"},{"waitSelector":".lp-row:has([title=\"Unsaved draft\"])"},
 {"click":".lp-launch"},{"waitText":"Request launched"},
 {"waitText":"entry 2 of 2","timeoutMs":15000},
 {"waitText":"verification-response /launchpad-replay","within":".lp-response"},
 {"waitNoText":"Revert draft"}]}
```

Launches are tracked. `Launch` returns a launch id that is the new entry's UUID; the entry is selected when its request arrives and stays pending until Marasi reports how it ended. While the open launchpad has a pending launch, the top bar's `Launch` (`.lp-launch`) becomes `Cancel` (`.lp-cancel`, spinner) in the same place. Entry rows carry `data-launch="pending|completed|cancelled|failed"`: pending shows a spinner, cancelled a ban icon, failed an alert icon whose title ends `· Failed: <reason>`; completed rows show the status code as before. The `Response` pane reads `Waiting for the response…` while pending, `Cancelled — no response` for a cancelled entry, and `Failed: <reason>` (for example `upstream_error` for a closed port) for a failed one. Keep a launch pending with a slow origin: copy the endpoint and delay its answer on `?sleep=<seconds>`, abandoning the timer when the client closes. Proven sequence, after a launchpad with HTTPS off exists:

```json
{"name":"launch-cancel","steps":[
 {"click":".lp-editor .cm-content"},{"key":"cmd+a"},
 {"insert":"GET /slow?sleep=60 HTTP/1.1\nHost: 127.0.0.1:18099\n\n"},
 {"click":".lp-launch"},{"waitText":"Request launched"},
 {"waitSelector":".lp-cancel"},{"waitSelector":".lp-entry[data-launch=pending]"},
 {"click":".lp-topbar"},{"key":"cmd+shift+."},
 {"waitSelector":".lp-launch"},{"waitSelector":".lp-entry[data-launch=cancelled]"},
 {"waitText":"Cancelled — no response","within":".lp-response"},
 {"click":".lp-editor .cm-content"},{"key":"cmd+a"},
 {"insert":"GET /closed HTTP/1.1\nHost: 127.0.0.1:18097\n\n"},
 {"click":".lp-launch"},
 {"waitSelector":".lp-entry[data-launch=failed][aria-current=true]","timeoutMs":20000},
 {"waitText":"Failed: upstream_error","within":".lp-response"}]}
```

Prove outcomes persisted with `select r.path, r.status_code, json_extract(r.metadata,'$.launch') from launchpad_request lr join request r on r.id=lr.request_id` (a cancelled launch stores its request with status `-1` and `{"status":"cancelled"}`; a closed port stores `502` with `{"reason":"upstream_error","status":"failed"}`). Switching projects or quitting ends pending launches as `failed` with reason `interrupted`.

Compare, with three entries and entry 3 selected (`Compare` stays disabled below two entries). Entry rows carry `data-compare="A"`/`"B"`; chips are `.lp-chip[data-side=left|right]`. Stored request lines use absolute URLs (`GET http://127.0.0.1:18099/… HTTP/1.1`), so wait on `/path HTTP/1.1`, not `GET /path`. The tab buttons render `capitalize`d lowercase text; match them with `hasText:"equest"`. The diff is a `@codemirror/merge` MergeView inside `.lp-diff`: changed lines carry `.cm-changedLine`, and each collapsed unchanged run is a `.cm-collapsedLines` bar (`⦚ N unchanged lines ⦚`) that expands on click. A 3-line request with one changed line has no collapsed run, so give the entries a longer body or skip that step.

```json
{"name":"compare","steps":[
 {"text":"Compare"},{"waitText":"click any entry in the sidebar"},{"waitSelector":".lp-entry[data-compare=\"A\"]"},
 {"text":"Previous (#2)"},{"waitSelector":".lp-diff"},{"waitSelector":".lp-entry[data-compare=\"B\"]"},
 {"click":".lp-diff .cm-collapsedLines"},{"waitNoSelector":".lp-diff .cm-collapsedLines"},
 {"click":".lp-compare-strip button","hasText":"equest"},
 {"click":".lp-chip[data-side=\"left\"]"},{"waitText":"to use as the new A"},
 {"click":".lp-entry","hasText":"/cmp-one"},{"waitText":"#1","within":".lp-chip[data-side=\"left\"]"},
 {"text":"Swap A and B"},{"waitText":"#1","within":".lp-chip[data-side=\"right\"]"},
 {"click":".lp-chip[data-side=\"right\"]"},{"key":"escape"},{"waitNoText":"to use as the new B"},
 {"key":"escape"},{"waitNoSelector":".lp-compare-strip"},{"waitNoSelector":"[data-compare]"}]}
```

Search. The `Search launchpads` box matches launchpad names and descriptions locally on every keystroke; a match lists the whole launchpad. For entries it asks Marasi 250 ms after the last keystroke, only for 3 or more characters (shorter text shows `Type 3 or more characters to search entries.`), through the `SearchLaunchpadEntries` binding: the text, trimmed, becomes one quoted literal searched in `request_head` (request line plus headers, so method, path and host match), `request_body`, `response_head` and `response_body`, case-insensitively. Each launchpad with matches lists `N matching entries` (`.lp-match-count`) and only those entries, original linked pairs included. `Searching entries…` shows while a query is in flight; an invalid query or failed search shows its message in `.lp-search-error` under the box. Quotes, backslashes, `OR`, `)`, `NEAR(` and `launchpad = "x"` in the text match literally. Seed a term that appears only in a response body with a copy of the endpoint that appends a fixed word to the body (not the URL), proxy one request with it through the Ledger and `Send to Launchpad`, and launch another from a second launchpad. Proven, with `zebracorn` only in the bodies of `/orig-one?withsecret=1` (Request 1's original) and `/launched-b?withsecret=1` (Request 3's second entry):

```json
{"name":"search-body","steps":[
 {"click":"input[aria-label=\"Search launchpads\"]"},{"insert":"zebracorn"},
 {"waitText":"/launched-b?withsecret=1","within":".lp-scroll"},{"waitText":"/orig-one?withsecret=1","within":".lp-scroll"},
 {"waitNoText":"/launched-c","within":".lp-scroll"},{"waitText":"1 matching entry","within":".lp-scroll"}]}
```

The editors also carry `.lp-scroll`, so `waitNoText` within it also reads the open entry's request; pick a path the open entry does not show. Hostile text (`x" OR "1 ) NEAR( launchpad = "y" \`) settles on `No matching launchpads or entries` with no `.lp-search-error`.

Tree, prompts and dock:

```json
{"name":"tree","steps":[
 {"text":"Show 4 more"},{"waitNoText":"earlier entries"},
 {"click":"div[role=switch]:has(input[name=\"Group by status\"])"},{"waitSelector":".lp-group"},
 {"click":".lp-group","hasText":"200"},
 {"click":"input[aria-label=\"Search launchpads\"]"},{"insert":"replay-1"},{"key":"escape"},
 {"click":".lp-entry","hasText":"/replay-13"},{"waitText":"Discard the draft?"},{"text":"Confirm"},
 {"text":"New launchpad"},{"insert":"Scratch pad"},{"key":"enter"},{"waitText":"Empty launchpad"},
 {"text":"Delete launchpad"},{"waitText":"Delete Scratch pad?"},{"text":"Confirm"},
 {"text":"Collapse sidebar"},{"waitSelector":".lp-strip"},{"text":"Show launchpads"},{"waitSelector":".lp-dock"}]}
```

`Latest in <launchpad>` appears at the bottom of the tree once the list at the top of the tree has its last entry cut off; collapse other launchpads and `Show N more` until the tree overflows. Drag-resize with `{"drag":".lp-resize","to":"<css>"}`: dropping on a control to the right widens the dock, and dropping on the rail (`[title="Ledger"]`) collapses it. `.lp-resize` takes no layout width: it is an 8px grab area drawn over the dock's border, so hovering it changes only that strip's colour.

Prove linkage with `select l.name, r.path, r.status_code from launchpad l join launchpad_request lr on lr.launchpad_id=l.id join request r on r.id=lr.request_id`. Proxied traffic can no longer be tagged for a launchpad (Marasi PR #28 removed `x-launchpad-id`), so the `+1` unseen badge needs a launch whose request arrives after another launchpad is opened; the store tests cover it, and no driver sequence for it is proven yet.

## Gotchas

- The empty state proves only that the route loaded.
- Moving between pages or launchpads never prompts; drafts survive in memory. In the page, only seeding over a dirty draft (`Discard the draft?`, also from clicking another entry) and deleting a launchpad prompt.
- Switching the project or closing Marasi with dirty drafts asks in a native warning dialog (`1 launchpad has an unsaved draft. Switch Project will discard them. Continue?`; on macOS its buttons are `Cancel` (the default) and the action, while on Windows and Linux, where Wails draws no custom buttons, `dialog.go` asks it as a Yes/No question defaulting to `No`; it also names active Armory runs it would cancel). The page reports its dirty-draft count through `SetUnsavedDraftCount`, and `confirmLosingWork` in `app.go` asks. Headless Chrome cannot see or answer that dialog, and Chrome's `OpenProject` call waits on it, so do not drive a project switch over a dirty draft; `app_draft_guard_test.go` covers the dialog.
- After `Cancel` on a prompt, wait with `waitNoSelector` on the modal rather than `waitNoText` on its title.
- Text waits match the editors too. Scope them with `"within":".lp-scroll"`, `".lp-editor"` or `".lp-response"`.
- The route check fails while the dock is collapsed (its marker lives in the dock). Expand it, or leave and re-enter the page.
- The target receives a real network request. Use a local disposable endpoint unless external delivery is the behavior under test.
- `Launch` is disabled while the UI's listener state is offline. HTTPS defaults to on for each new draft; disable it for a plain local HTTP endpoint.
- A launch that cannot start (an unparsable draft, a missing Host) shows `Failed to launch the request` at once and never goes pending. There is no pending timeout: a launch stays pending until Marasi reports its end, so Cancel it rather than waiting. `Request launched` only means the launch was accepted: require the endpoint's response, a new entry, and persisted linkage.
- `Launch` and `Cancel` swap in one spot. Click `.lp-launch` or `.lp-cancel`, so the click fails if the button is not in the state you expect.
- The `Jump to Launchpad` toast lives 5 s, and each driver click can take about 5 s to be acknowledged in the headless page. Click it right after the toast appears. A click on the mounted Launchpad page before it lets the toast expire.
- The headless page reports `visibilityState: hidden`: `requestAnimationFrame` never fires, and CDP does not always ack `Input.dispatchMouseEvent`. Send drag events without awaiting the reply.
- Editing frontend source during a run makes Vite reload the page, which resets the listener to offline. Clean up and relaunch.
