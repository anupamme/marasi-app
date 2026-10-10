# Application settings

## Sub-features

- Vim, syntax mode, default interface, and default port
- Waypoint management
- Chrome executable paths and profiles
- Build version displayed beside the page heading (`dev` in a local development build)
- Keybindings modal (`Configure Keybindings`): rebind menu actions per profile and platform, saved to the `keybindings` section of `marasi_appconfig.yaml`

## How to get to it (user POV)

Select the rail item titled `Settings`, or press `Command+S` from any route. The page shows `Marasi Settings`, the build version, and a sections list (`nav[aria-label="Settings sections"]`): Keyboard & Editor (default), Listener, Waypoints, Browser and About. Only the selected section is rendered; pick one with `{"click":"nav[aria-label=\"Settings sections\"] button","hasText":"Waypoints"}`.

Shortcuts: every menu shortcut for this feature is a catalog action in context `global` (Settings has no page menu) in `frontend/src/lib/keybindings/catalog.js`; the Marasi menu (`⌘K`) on the page lists them with their current keys.

## Driving it with Chrome CDP

Run `scripts/drive.sh settings` for route proof. For persistence, toggle Vim and confirm `vim_enabled` changed in the isolated `marasi_appconfig.yaml`, then toggle it back and prove the original value was restored:

```json
{"name":"vim-off","steps":[{"click":"[data-testid=\"slide-toggle\"]"},{"waitSelector":"[role=switch][aria-checked=false]"}]}
```

The checkbox inside is `display:none`; read state from `[role=switch]`'s `aria-checked`. The toggle has no visible caption (its row reads `Vim mode`); use `section [role=switch]` (the rail's theme switch is also a `[role=switch]`).

Keybindings: `{"text":"Configure Keybindings"}` opens the modal (`[data-keybindings-modal]`). The sidebar has two columns: pick a page in `nav[aria-label=Page]` (for example `{"click":"nav[aria-label=Page] button","hasText":"WebSocket"}`), then a state in `nav[aria-label=State]` (`"hasText":"Stream tab"`); selecting a page selects its first state. Row controls have labels: `button[aria-label="Add binding to Ledger"]`, `button[aria-label="Remove ⌘+J from Ledger"]`, `button[aria-label="Reset Ledger"]`. Adding or re-recording a chip opens `[data-key-capture]`; send the combination with a `key` step. Escape cancels only the capture. Save closes the modal with a `Keybindings saved` toast; a failed save shows `[data-save-error]` and keeps the draft. Prove the result with the shortcut itself and the isolated YAML, then close with Cancel and `Discard` (or Escape when nothing changed) so doctor sees no residue:

```json
{"name":"kb-save","steps":[{"text":"Configure Keybindings"},{"waitText":"Every page"},{"click":"button[aria-label=\"Add binding to Ledger\"]"},{"waitSelector":"[data-key-capture]"},{"key":"cmd+j"},{"waitText":"Unsaved changes"},{"text":"Save"},{"waitText":"Keybindings saved"},{"key":"cmd+j"},{"waitPath":"/ledger"}]}
```

## Gotchas

- General settings persist to `marasi_appconfig.yaml`, Chrome settings to `marasi_config.yaml`, and waypoints to the project database.
- Address and port edits do not visibly restart the current listener.
- Chrome Paths and Chrome Profiles are both in the Browser section; the profiles table can sit below the fold with many paths, and the driver scrolls a unique match into view.
- Default interface and Default port (Listener section) persist on `change` (blur or Enter), not per keystroke. Both share `placeholder="Listener"`; use `aria-label="Default interface"` / `"Default port"`.
- Syntax highlighting is a three-button switch (`[role=radiogroup][aria-label="Syntax highlighting"]`); each button writes `syntax_mode` on click and the current one has `aria-checked=true`.
- Row X and pencil buttons have `title="Delete"` / `title="Edit"`; find the `<tr>` with `hasText` first. Each table's add row is its `<tfoot>`.
- Adding a Chrome profile only appends YAML. Deleting a profile also removes `$configDir/chrome_profiles/<name>`. Directories appear later when Chrome starts.
- Keybinding conflicts show on the row (`… is also bound to …`) and block Save: `[data-save-blocked]` in the footer names one problem as `Profile · Platform · Page · State · Action: …` (with `(i of N problems)` when there are several), including problems on a profile or platform not on screen. `Show` switches to it; `Next` steps to the next problem in a fixed order (every profile, macOS before Windows / Linux) and switches to it. When the saved section failed to load (for example `version: 99`, set up by editing the isolated YAML and running `restart.sh`), Save first asks `Replace saved keybindings?` in `[role=alertdialog]`; its Cancel leaves the YAML untouched.
- The keybindings modal takes Escape and backdrop clicks over: they cancel a capture, dismiss an in-modal card, or ask `Discard changes?` before closing with unsaved edits. To simulate a failed save, make the isolated config directory unwritable (`chmod a-w`), and restore it before cleanup.
- Keybinding profiles: `{"text":"Manage"}` opens `[data-profile-menu]`; pick entries with `{"text":"Duplicate","within":"[data-profile-menu]"}`. Disabled entries keep their reason in `title` (for example `button[role=menuitem][disabled][title="The last profile cannot be deleted"]`). New Profile, Duplicate and Rename open `[data-profile-name]` with the name selected: `cmd+a`, `insert`, then `enter`. Delete and the platform Reset confirm in `[role=alertdialog]`. Switch the platform with `{"click":"[data-keybindings-modal] label.label select"}` then `{"key":"w"}` or `{"key":"m"}`. Windows / Linux chips read `ctrl+⇧+J`, so aria-labels are `Remove ctrl+⇧+J from Ledger`.
- Profile Import and Export (Manage menu) use native open/save dialogs that headless Chrome cannot operate. Launch with `MARASI_KEYBINDINGS_PROFILE_FILE=<absolute path> scripts/launch.sh`: both entries then skip the dialog and use that path. Export writes the file (toast `Exported <name> to <file>`). Import reads it on each click, so rewrite the file between imports to test other content. A success toasts `Imported <name>. It is not active; save to keep it.` and selects the profile. A rejected file opens `[data-profile-notice]` (`Profile not imported`, `<file>: <reason>`) and leaves the draft unchanged. The format is in `docs/keybinding-profile-format.md`.
- Ledger's palette lists only Ledger page actions; check global bindings (for example Ledger's `⌘+2`, or a binding you just saved) in the menu on Settings or Home.
