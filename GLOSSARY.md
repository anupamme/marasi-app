# Marasi App

The desktop app for Marasi. It presents a project's traffic and the proxy's tools to a researcher. Terms Marasi itself defines, such as traffic, request/response pair, and query, keep Marasi's meaning here.

## Language

### Ledger

**Ledger**:
The app's table of the open project's traffic.
_Avoid_: history, HTTP history, proxy items

**Live view**:
The ledger with no query: every request/response pair, with new traffic appearing as it is captured.
_Avoid_: unfiltered view, all items

**Query**:
A text expression that narrows the ledger to the request/response pairs that match it, as Marasi defines it. It is not stored.
_Avoid_: search, search string, filter, FTS

**Query results**:
The request/response pairs that match the ledger's current query, newest first.
_Avoid_: search results, filtered items

**New matches**:
Request/response pairs that match the current query but arrived or started matching after the query results were shown. They join the query results only when the researcher asks.
_Avoid_: updates, live results

**Content-type exclusion**:
The project's list of content types the ledger hides, in both the live view and query results. A pair with no content type yet is never hidden by it.
_Avoid_: filter, content type filter

### Launchpad

**Launchpad entry**:
An ordinary request/response pair linked to a launchpad rather than copied. A launchpad's entries are a flat, oldest-first timeline; the first entry is the pair the launchpad was created from, and every Launch adds one more.
_Avoid_: member, tab, request when referring to the linked pair

**Launchpad draft**:
The working request of a launchpad, held only in memory, seeded from one launchpad entry and sent by Launch. It is dirty when it differs from the request of the entry it was seeded from, and it is lost when the project closes.
_Avoid_: edit, buffer, saved request

### Marasi menu keybindings

**Menu action**:
A Marasi-defined operation exposed through the Marasi menu, such as navigating to a page or focusing an editor. Its behavior and availability are not changed by rebinding its keys.
_Avoid_: editable action, user-defined command

**Menu context**:
A Marasi-defined page or interface state that determines which menu actions are available, such as Ledger with its drawer open or closed.
_Avoid_: keybinding mode

**Keybinding profile**:
A named collection of bindings for Marasi menu actions that a researcher can select and customize. Factory defaults remain recoverable independently of those customizations.
_Avoid_: Vim mode, Chrome profile
