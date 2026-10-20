## Go commands

Run Go commands as `GOWORK=off go …`. Agent worktrees can sit inside a checkout whose parent `go.work` excludes this module, and `go` then fails with "main module … does not contain package". A fresh worktree runs `scripts/bootstrap.sh` first, to create `frontend/build`, `frontend/node_modules` and the Wails bindings.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
