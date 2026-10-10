# Dashboard, listener, and appearance

## Sub-features

- Scratchpad project startup, traffic metrics, reporting, and scope summaries
- Application log table
- Listener status and listener reconfiguration
- Open Project, Download Certificate, and Start Chrome actions
- Global light/dark appearance toggle

## How to get to it (user POV)

Launch Marasi or select the rail item titled `Home`. The command shortcut is `Command+1`. A ready scratchpad shows `scratchpad Project Dashboard`, listener address and port, `Open Project`, `Download Certificate`, `Start Chrome`, and an application log table with ID, Level, Message, Request Response ID, Extension, and Timestamp columns.

Shortcuts: every menu shortcut for this feature is a catalog action in context `global` (Home has no page menu; its buttons share the global actions) in `frontend/src/lib/keybindings/catalog.js`; the Marasi menu (`⌘K`) on the page lists them with their current keys.

## Driving it with Chrome CDP

Run `scripts/drive.sh dashboard`. It clicks the actionable `[title="Home"]` through Chrome DevTools and requires `Project Dashboard` in the resulting DOM. For listener startup, pair this with `scripts/doctor.sh`; the doctor proves that the configured listener port and scratchpad SQLite file exist.

Drive the listener button by its painted `127.0.0.1:<port>` text only when reconfiguration is under test. Prove Open Project with `scripts/drive.sh dashboard compare "Open Project" "cmd+o"`; that clicks the dashboard button and then sends `⌘+O` (the catalog's `global.open-project` action), and both must paint the same `Switch Projects` overlay. Compare waits for the overlay text to settle before capturing, because the modal shows `No recent projects` until the list loads. `Browse Files...` and certificate download use native dialogs that browser mode cannot display.

Run `scripts/drive.sh dashboard theme` to leave Home for Settings, toggle light/dark mode with `Command+U`, and toggle it back. This proves the global shortcut reads the live theme after navigating away from the dashboard.

## Gotchas

- The normal app uses port `8080`; the verification launch defaults to isolated port `18080`.
- A dashboard can render after a listener bind failure. UI readiness alone does not prove proxy readiness.
- Download Certificate opens a native save dialog. Start Chrome opens an external process. Record and clean up anything those actions create.
- The Marasi menu (MarasiKeys) keeps a closed `<dialog>` of the same labels. The driver's hit-test skips those copies; never target a label by `textContent`.
- `Project Dashboard` paints before the cards, log table, and listener status finish loading. Notes, Launchpads, Intercepted, and scope counts refresh only when Home mounts or the active project changes. Wait for the specific value.
- Shortcuts are gated by `frontend/src/lib/keybindings/gate.js`: unmodified keys never fire from inputs or editors; modified ones are dropped from form fields except on `/ledger` and `/logbook` (and the menu's own search field). An open modal blocks page and drawer shortcuts; global ones and the modal's own still run.
