# Request replay

## Sub-features

- Launchpad dock: drag to resize, snap-collapse to a strip, auto-hide while editing
- Launchpad file tree: Launchpad entries windowed to the original plus the last 10, Group by status, Expand all / Collapse all, Latest-in button
- Search, create empty launchpad, rename and description
- Launchpad draft editor, HTTPS toggle, Launch, response display, unsaved-draft prompts
- Compare two entries: A/B picking, quick picks, read-only CodeMirror MergeView with Request/Response tabs, chip re-pick, swap, Esc

## How to get to it (user POV)

Select the rail item titled `Launchpad` or press `Command+5`. The left dock holds the tree: a `Launchpads N` header with `Expand all` (`.lp-expand-all`), `Collapse all` (`.lp-collapse-all`) and `New launchpad` (+) buttons, a `Search launchpads` input, and a `Group by status` SlideToggle. A fresh project shows `No launchpads yet` in the tree and `No launchpad selected` in the workspace. Users add a launchpad from a Ledger request with `Send to Launchpad` (from the request drawer that is `⌘⇧L`, which shows `Request N sent to Launchpad` with a `Jump to Launchpad` action), or create an empty one with +.

Each launchpad row shows its name, a warning dot (`title="Unsaved draft"`) for a dirty Launchpad draft, a `+N` unseen badge for entries that arrived while it was not open, its entry count, and its last status. Under an open launchpad, entry rows (`.lp-entry`) show number, method, path, status and length; the first carries the original-entry icon. Lists longer than 11 show `N earlier entries` with `Show N more` and, past 50 hidden, `Show all`. The workspace top bar shows the name with a `Rename launchpad` pencil, `entry X of N`, `Revert draft` while dirty, the `HTTPS` toggle, `Launch`, and `Delete launchpad`. Below it, the request editor (`.lp-editor`) and the `Response` pane (`.lp-response`) sit side by side. The editor title (`.lp-request-title`) reads `Request`, and `Request draft` with the unsaved dot only while the draft is dirty. Expand all opens every launchpad (and every status folder while grouping); Collapse all closes them all, and the selected launchpad stays closed.

Shortcuts: every menu shortcut for this feature is a catalog action in context `launchpad` in `frontend/src/lib/keybindings/catalog.js`; the Marasi menu (`⌘K`) on the page lists them with their current keys. Factory keys: `⌘⇧S` search (expands the dock and focuses the search box), `⌘⇧A` new launchpad, `⌘R` rename (id `launchpad.toggle-settings`), `⌘\` toggle the dock, `⌘⇧G` Group by status, `⌘⇧↓` jump to latest, `⌘⇧C` start or close compare, `⌘⇧R` switch the compare Request/Response view (`launchpad.toggle-compare-view`), `⌘⇧X` swap A and B, `⌘]`/`⌘[` next/previous launchpad (ids `launchpad.next-tab`/`previous-tab`), `⌘⇧D` delete launchpad (`launchpad.delete-tab`). Like the Ledger, `/launchpad` lets modified shortcuts fire from its text fields: `⌘K` opens and closes the Marasi menu from the search box, the rename name and description inputs, and the create input (the create input stays open while the menu borrows focus, and focus returns to it on close). Fields keep Escape and Enter, and `⌘⇧↓` yields to a focused field or editor, so click `.lp-topbar` before it. The driver sends `cmd+\\` and `cmd+shift+down`.

```json
{"name":"shortcuts","steps":[
 {"key":"cmd+shift+a"},{"insert":"KB pad"},{"key":"cmd+k"},{"waitSelector":"#commandmenu"},{"key":"cmd+k"},{"waitNoSelector":"#commandmenu"},
 {"waitSelector":"input[aria-label=\"New launchpad name\"]:focus"},{"key":"enter"},{"waitText":"Empty launchpad"},
 {"click":".lp-topbar"},{"key":"cmd+\\"},{"waitSelector":".lp-strip"},
 {"key":"cmd+shift+s"},{"waitSelector":"input[aria-label=\"Search launchpads\"]:focus"},{"key":"escape"},
 {"click":".lp-topbar"},{"key":"cmd+r"},{"waitSelector":"input[aria-label=\"Launchpad name\"]"},{"key":"escape"}]}
```

`⌘⇧↓` always selects the open launchpad's newest entry, even in a short list, through the same path as a click (a dirty draft asks `Discard the draft?`), then opens its launchpad and status folder and scrolls it into view: with entry 1 of 3 selected, wait for `entry 3 of 3`. While that launchpad is being compared it only scrolls; A and B stay as picked. The floating `Latest in …` button only scrolls and never changes the selection. With two or more entries, `⌘⇧C` shows `click any entry in the sidebar`; after a quick pick, `⌘⇧R` flips `.lp-compare-strip button[aria-pressed="true"]` and `⌘⇧X` moves the A entry's number into `.lp-chip[data-side="right"]`. The tree scrolls smoothly; in headless Chrome the `Latest in …` button can stay in the DOM after the scroll, so check the screenshot rather than waiting for the text to go.

Seed a short launchpad without the Ledger: create it, read its id with `select id from launchpad`, and send `curl -x http://127.0.0.1:18080 -H "x-launchpad-id: <id>" http://127.0.0.1:18099/keys-one` (repeat per entry).

## Driving it with Chrome CDP

Run `scripts/drive.sh launchpad` for route proof. It requires `Group by status`, which the dock paints on every visit (the dock always mounts expanded). Proven handoff from Ledger:

```json
{"name":"send-to-launchpad","steps":[
 {"click":"tbody tr","hasText":"/compass-allowed"},{"waitSelector":".drawer"},
 {"key":"cmd+shift+l"},{"waitText":"sent to Launchpad"},
 {"text":"Jump to Launchpad"},{"waitPath":"/launchpad"},{"waitNoSelector":".drawer"},
 {"waitText":"Group by status"}]}
```

Then, on Launchpad, edit the draft and Launch:

```json
{"name":"edit-and-launch","steps":[
 {"click":"div[role=switch]:has(input[name=\"TLS Toggle\"])"},
 {"waitSelector":"div[role=switch][aria-checked=false]:has(input[name=\"TLS Toggle\"])"},
 {"click":".lp-editor .cm-content"},{"key":"cmd+a"},
 {"insert":"GET /launchpad-replay HTTP/1.1\nHost: 127.0.0.1:18099\n\n"},
 {"waitText":"Revert draft"},{"waitText":"Request draft","within":".lp-request-title"},{"waitSelector":".lp-row:has([title=\"Unsaved draft\"])"},
 {"text":"Launch"},{"waitText":"Request launched"},
 {"waitText":"entry 2 of 2","timeoutMs":15000},
 {"waitText":"verification-response /launchpad-replay","within":".lp-response"},
 {"waitNoText":"Revert draft"}]}
```

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

`Latest in <launchpad>` appears at the bottom of the tree once the list at the top of the tree has its last entry cut off; collapse other launchpads and `Show N more` until the tree overflows. Drag-resize has no driver step; drive `.lp-resize` with raw `Input.dispatchMouseEvent` (fire and forget, see Gotchas).

Prove linkage with `select l.name, r.path, r.status_code from launchpad l join launchpad_request lr on lr.launchpad_id=l.id join request r on r.id=lr.request_id`. Tag traffic for a launchpad that is not open with `curl -x http://127.0.0.1:18080 -H "x-launchpad-id: <launchpad id>" …` to see its `+1` unseen badge.

## Gotchas

- The empty state proves only that the route loaded.
- Moving between pages or launchpads never prompts; drafts survive in memory. Only seeding over a dirty draft (`Discard the draft?`) and deleting a launchpad prompt.
- After `Cancel` on a prompt, wait with `waitNoSelector` on the modal rather than `waitNoText` on its title.
- Text waits match the editors too. Scope them with `"within":".lp-scroll"`, `".lp-editor"` or `".lp-response"`.
- The route check fails while the dock is collapsed (its marker lives in the dock). Expand it, or leave and re-enter the page.
- The target receives a real network request. Use a local disposable endpoint unless external delivery is the behavior under test.
- `Launch` is disabled while the UI's listener state is offline. HTTPS defaults to on for each new draft; disable it for a plain local HTTP endpoint.
- A send that `Repeat` rejects (for example an unparsable draft) shows `Failed to launch the request` and clears `Launching…`. A launch whose entry never arrives stops pending after 15 s. `Request launched` only means the send was accepted: require the endpoint's response, a new entry, and persisted linkage.
- The right-click `Send to Launchpad` path opens `/launchpad?lastTab=1`, which the page ignores. The drawer path uses `?id=`.
- The headless page reports `visibilityState: hidden`: `requestAnimationFrame` never fires, and CDP does not always ack `Input.dispatchMouseEvent`. Send drag events without awaiting the reply.
- Editing frontend source during a run makes Vite reload the page, which resets the listener to offline. Clean up and relaunch.
