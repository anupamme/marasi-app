<script>
	// The Ledger: the sitemap dock (full height), then a one-row toolbar, the
	// windowed table, the drawer below it while a pair is selected, and the
	// status bar. Its state lives in the Ledger store, so the layout and the
	// selection survive page visits.
	import { goto } from "$app/navigation";
	import { lineWrap } from "../../stores";
	import { getModalStore, getToastStore, modeCurrent } from "@skeletonlabs/skeleton";
	import {
		Search,
		ToggleLeftIcon,
		SearchIcon,
		FilterIcon,
		ArrowRightIcon,
		ArrowLeftIcon,
		SquareArrowUpRightIcon,
		PenIcon,
		SendIcon,
		CopyIcon,
		BracesIcon,
		MaximizeIcon,
		WrapTextIcon,
		BookCheckIcon,
		LinkIcon,
		Unlink,
		ShieldAlertIcon,
		Swords,
		RadioIcon,
		X,
		LoaderCircle,
		CircleHelp,
		CircleAlert,
		TriangleAlert,
		PanelLeftIcon,
		MenuIcon,
		Tags,
	} from "lucide-svelte";
	import QueryFieldList from "../../lib/components/QueryFieldList.svelte";
	import LedgerQueryBox from "../../lib/ledger/LedgerQueryBox.svelte";
	import SavedQueriesMenu from "../../lib/ledger/SavedQueriesMenu.svelte";
	import { readyMadeQueries } from "../../stores/savedQueriesStore";
	import { appendToQuery } from "../../lib/ledgerQueryFields";
	import MarasiKeys from "../../lib/components/MarasiMenu/MarasiKeys.svelte";
	import { useMenuActions } from "../../lib/keybindings/app.js";
	import { canOpenDrawerStream } from "../../lib/websocket/presentation.js";
	import Dock from "../../lib/dock/Dock.svelte";
	import { LEDGER_DOCK } from "../../lib/dock/dock.js";
	import LedgerTable from "../../lib/ledger/LedgerTable.svelte";
	import LedgerSitemap from "../../lib/ledger/LedgerSitemap.svelte";
	import { activeSitemapNode, chooseSitemapNode, excludeSitemapNode, stripLabel } from "../../lib/ledger/sitemap.js";
	import { sitemapStore } from "../../stores/sitemapStore";
	import LedgerDrawer from "../../lib/ledger/LedgerDrawer.svelte";
	import RowMenu from "../../lib/ledger/RowMenu.svelte";
	import {
		curlCommand,
		markdownTable,
		narrowQuery,
		pairURL,
		requestCount,
		similarIDs,
	} from "../../lib/ledger/rowMenu.js";
	import ToolbarMenu from "../../lib/ledger/ToolbarMenu.svelte";
	import MarksMenu from "../../lib/ledger/MarksMenu.svelte";
	import { MARKS, activeMarkCount } from "../../lib/ledger/marks.js";
	import LedgerTypesMenu from "../../lib/ledger/LedgerTypesMenu.svelte";
	import { rowHighlight } from "../../lib/ledger/table.js";
	import { launchpadStore } from "../../stores/launchpadStore";
	import { primaryVariant } from "../../lib/launchpad/format.js";
	import { highlightPalette } from "../../stores/highlightsStore";
	import { testCaseStore } from "../../stores/testCaseStore";
	import { findingStore } from "../../stores/findingStore";
	import {
		ledgerStore,
		select,
		tableRows,
		hiddenByTypeCount,
		focusedPair,
		drawerKeybindingState,
		isQueryActive,
		indexWarning,
		selectedPairs,
		LAUNCHPADS_EACH_MAX,
		countLabel,
		newMatchesKind,
		newMatchesLabel,
	} from "../../stores/ledgerStore";

	// The parts of the Ledger store the page follows. Each notifies only when
	// its own value changes.
	const rows = select(ledgerStore, tableRows);
	const hiddenCount = select(ledgerStore, hiddenByTypeCount);
	const query = select(ledgerStore, (state) => state.query);
	const queryText = select(ledgerStore, (state) => state.queryText);
	const queryPending = select(ledgerStore, (state) => state.queryPending);
	const queryActive = select(ledgerStore, (state) => isQueryActive(state.query));
	// The row menu's Hide type adds to it.
	const exclusion = select(ledgerStore, (state) => state.exclusion);
	const selection = select(ledgerStore, (state) => state.selection);
	const focused = select(ledgerStore, focusedPair);
	const drawerLayout = select(ledgerStore, (state) => state.layout.drawer);
	const drawerKeys = select(ledgerStore, drawerKeybindingState);
	const results = select(ledgerStore, (state) => state.results);
	const sort = select(ledgerStore, (state) => state.sort);
	const statusCount = select(ledgerStore, countLabel);
	const indexNote = select(ledgerStore, indexWarning);
	const newKind = select(ledgerStore, newMatchesKind);
	const newLabel = select(ledgerStore, newMatchesLabel);

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	let dock;
	let sitemapFind;
	let table;
	let tableArea;
	let queryFieldsOpen = false;
	// The row menu: whether it shows, where, and the pairs it acts on, taken
	// from the selection when it opens.
	let rowMenu = { open: false, x: 0, y: 0, pairs: [] };
	let typesMenu;

	$: primary = primaryVariant($modeCurrent);
	$: sitemapNode = activeSitemapNode($queryText);
	$: drawerOpen = Boolean($focused);
	$: focusID = $selection.focus;
	$: focusNumber = $focused ? ledgerStore.pairNumber($focused.ID) : "";
	$: selectedCount = $selection.ids.size;
	$: allSelected = selectedCount > 1 && selectedCount === $rows.length;
	// Marasi's error for the text in the query box, underlined there; an
	// error for text since edited is stale.
	$: queryBoxError = $query.error?.query === $queryText ? $query.error : null;
	// Rows are numbered by their position in the results.
	$: firstNumber = $results.start == null ? null : $results.start + 1;

	// The toast style the Ledger's handoffs use.
	$: handoffBackground = $modeCurrent
		? "bg-surface-50 text-surface-900 border border-surface-300"
		: "bg-surface-100 text-surface-900";

	// "N new" in the newest-first live view: back to the top, with them.
	function showNewAtTop() {
		ledgerStore.goToTop();
		table?.scrollToTop();
	}

	function selectAndReveal(id) {
		ledgerStore.selectPair(id);
		table?.reveal(id);
	}

	// The focused row stays in view as the selection moves.
	$: if (focusID != null) table?.reveal(focusID);

	function closeDrawer() {
		ledgerStore.clearSelection();
		table?.focus();
	}

	// Esc closes the drawer, unless a modal or a text field has the key.
	function onWindowKeydown(event) {
		if (event.key !== "Escape" || !drawerOpen || $modalStore[0]) return;
		const target = event.target;
		if (target?.closest?.("input, textarea, [contenteditable='true'], .cm-editor")) return;
		event.preventDefault();
		closeDrawer();
	}

	// Drag the drawer's top edge to resize it.
	function startDrawerResize(event) {
		event.preventDefault();
		const rect = tableArea.getBoundingClientRect();
		const move = (e) => ledgerStore.setDrawerSplit((rect.bottom - e.clientY) / rect.height);
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}

	function copyText(text, done, failed) {
		navigator.clipboard
			.writeText(text ?? "")
			.then(() => toastStore.trigger({ message: done, background: "variant-filled-success" }))
			.catch(() => toastStore.trigger({ message: failed, background: "variant-filled-error" }));
	}

	function toastError(message, error) {
		toastStore.trigger({
			message: error ? `${message}: ${String(error)}` : message,
			background: "variant-filled-error",
		});
	}

	// A toast with a button that leaves for another page.
	function toastJump(message, label, path) {
		const toastId = toastStore.trigger({
			message,
			background: handoffBackground,
			action: {
				label,
				response: () => {
					toastStore.close(toastId);
					goto(path);
				},
			},
		});
	}

	// "Request 4", or "3 requests".
	function describe(pairs) {
		return pairs.length === 1
			? `Request ${ledgerStore.pairNumber(pairs[0].ID)}`
			: requestCount(pairs.length);
	}

	// Adds " (N failed)" when some per-pair calls failed.
	const failures = ({ failed }) => (failed ? ` (${failed} failed)` : "");

	// The selected pairs, in table order.
	const selectionPairs = () => selectedPairs(get(ledgerStore));
	const idsOf = (pairs) => pairs.map((pair) => pair.ID);

	// The focused pair's full request and response.
	function focusedDetails() {
		return $focused ? ledgerStore.getDetails($focused.ID) : Promise.reject(new Error("no pair"));
	}

	async function openWebSocketStream() {
		if (!drawerOpen || !canOpenDrawerStream($drawerKeys.meta) || $modalStore[0]) return;
		const details = await focusedDetails();
		modalStore.trigger({
			type: "component",
			component: "WebsocketStream",
			toggleAction: "ledger.drawer-open.websocket.open-stream",
			meta: {
				upgradeRequest: structuredClone({
					Metadata: details.Metadata,
					Request: details.Request,
					Response: $selection.incomingResponse || details.Response,
				}),
			},
		});
	}

	// Each action below works on the pairs it is given: the selection, from
	// the row menu or a shortcut. They make one call per pair and report
	// through a toast.

	async function sendToArmory(pairs) {
		const result = await ledgerStore.sendToArmory(idsOf(pairs));
		if (result.done === 0) return toastError(`Failed to send ${describe(pairs)} to Armory`);
		const first = result.results[0];
		toastJump(`${describe(pairs)} sent to Armory${failures(result)}`, "Jump to Armory", `/armory?id=${first.ID}`);
	}

	// The launchpad list in the menu learns about launchpads made here.
	const refreshLaunchpads = () =>
		launchpadStore.populate().catch((err) => console.error("Refreshing launchpads failed:", err));

	async function sendToNewLaunchpad(pairs) {
		try {
			const result = await ledgerStore.sendToNewLaunchpad(idsOf(pairs));
			refreshLaunchpads();
			toastJump(
				`${describe(pairs)} sent to a new launchpad${failures(result)}`,
				"Jump to Launchpad",
				"/launchpad?id=" + result.launchpadId,
			);
		} catch (error) {
			toastError("Failed to create a launchpad", error);
		}
	}

	async function sendToLaunchpadsEach(pairs) {
		if (pairs.length > LAUNCHPADS_EACH_MAX) return;
		try {
			const result = await ledgerStore.sendToLaunchpadsEach(idsOf(pairs));
			refreshLaunchpads();
			toastJump(
				`Created ${result.done} ${result.done === 1 ? "launchpad" : "launchpads"}${failures(result)}`,
				"Jump to Launchpad",
				"/launchpad?id=" + (result.launchpadIds[0] ?? ""),
			);
		} catch (error) {
			toastError("Failed to create launchpads", error);
		}
	}

	async function addToLaunchpad(pairs, launchpadId, name) {
		const result = await ledgerStore.addToLaunchpad(idsOf(pairs), launchpadId);
		refreshLaunchpads();
		toastJump(
			`Added ${describe(pairs)} to "${name}"${failures(result)}`,
			"Jump to Launchpad",
			"/launchpad?id=" + launchpadId,
		);
	}

	// Links or unlinks the pairs and a finding or test case.
	async function changeLinks(pairs, run, verb, noun, title) {
		const result = await run(idsOf(pairs));
		if (result.done === 0) return toastError(`Failed to ${verb.toLowerCase()} ${describe(pairs)}`);
		const preposition = verb === "Linked" ? "to" : "from";
		toastStore.trigger({
			message: `${verb} ${describe(pairs)} ${preposition} ${noun} "${title}"${failures(result)}`,
			background: handoffBackground,
		});
	}

	// The context menu's Copy submenu. Raw requests and responses are read
	// when copied, never when the menu opens.
	async function copyPairs(pairs, what) {
		const label = describe(pairs);
		if (what === "urls") {
			return copyText(pairs.map(pairURL).join("\n"), `Copied ${pairs.length === 1 ? "URL" : `${pairs.length} URLs`}`, "Failed to copy URLs");
		}
		if (what === "markdown") {
			return copyText(markdownTable(pairs, (pair) => ledgerStore.pairNumber(pair.ID)), "Copied a Markdown table", "Failed to copy");
		}
		if (what === "numbers") {
			return copyText(
				pairs.map((pair) => ledgerStore.pairNumber(pair.ID)).join(", "),
				"Copied request numbers",
				"Failed to copy",
			);
		}
		let details;
		try {
			details = await Promise.all(pairs.map((pair) => ledgerStore.getDetails(pair.ID)));
		} catch (error) {
			return toastError(`Failed to read ${label}`, error);
		}
		if (what === "curl") {
			const text = pairs.map((pair, i) => curlCommand(pair, details[i]?.Request?.Raw)).join("\n\n");
			return copyText(text, "Copied as cURL", "Failed to copy");
		}
		if (what === "requests") {
			const text = details.map((d) => d?.Request?.Raw ?? "").join("\n\n");
			return copyText(text, pairs.length === 1 ? "Request copied to clipboard" : `Copied ${label}`, "Failed to copy request");
		}
		if (what === "responses") {
			const incoming = $selection.incomingResponse;
			const text = details
				.map((d, i) => {
					const live = incoming && String(incoming.ID) === String(pairs[i].ID) ? incoming : null;
					return (live || d?.Response)?.Raw ?? "";
				})
				.filter(Boolean)
				.join("\n\n");
			return copyText(text, pairs.length === 1 ? "Response copied to clipboard" : `Copied the responses of ${label}`, "Failed to copy response");
		}
	}

	// Adds a term to the query and runs it.
	function narrow(term) {
		const text = narrowQuery($queryText, term);
		ledgerStore.setQueryText(text);
		ledgerStore.runQuery(text);
		toastStore.trigger({ message: `Narrowed the query: ${term}`, background: handoffBackground });
	}

	async function hideType(contentType) {
		if ($exclusion.includes(contentType)) return;
		const before = [...$exclusion];
		await ledgerStore.saveExclusion([...before, contentType]);
		const toastId = toastStore.trigger({
			message: `Hid ${contentType}`,
			background: handoffBackground,
			action: {
				label: "Undo",
				response: () => {
					toastStore.close(toastId);
					ledgerStore.saveExclusion(before);
				},
			},
		});
	}

	function selectSimilar(pairs, kind) {
		const ids = similarIDs(kind, $rows, pairs);
		ledgerStore.selectIDs(ids);
		toastStore.trigger({ message: `Selected ${requestCount(ids.length)}`, background: handoffBackground });
	}

	function openMetadata(id) {
		ledgerStore.getMetadata(id).then((metadata) =>
			toggleModal("Metadata", {
				type: "component",
				component: "Metadata",
				toggleAction: "ledger.drawer-open.view-metadata",
				content: metadata,
				title: "Request " + ledgerStore.pairNumber(id) + " Metadata",
			}),
		);
	}

	/** Runs a row menu action (rowMenu.js) on `pairs`. */
	function runMenuAction(action, pairs) {
		if (!action || pairs.length === 0) return;
		const ids = idsOf(pairs);
		switch (action.type) {
			case "open":
				ledgerStore.focusPair(action.id);
				return;
			case "websocket":
				ledgerStore.focusPair(action.id);
				return openWebSocketStream();
			case "new-launchpad":
				return sendToNewLaunchpad(pairs);
			case "launchpad-each":
				return sendToLaunchpadsEach(pairs);
			case "add-to-launchpad":
				return addToLaunchpad(pairs, action.id, action.name);
			case "armory":
				return sendToArmory(pairs);
			case "new-finding":
				return createFinding(ids);
			case "new-test-case":
				return createTestCase(ids);
			case "link-finding":
				return changeLinks(pairs, (ids) => ledgerStore.linkToFinding(ids, action.id), "Linked", "finding", action.title);
			case "unlink-finding":
				return changeLinks(pairs, (ids) => ledgerStore.unlinkFromFinding(ids, action.id), "Unlinked", "finding", action.title);
			case "link-test-case":
				return changeLinks(pairs, (ids) => ledgerStore.linkToTestCase(ids, action.id), "Linked", "test case", action.title);
			case "unlink-test-case":
				return changeLinks(pairs, (ids) => ledgerStore.unlinkFromTestCase(ids, action.id), "Unlinked", "test case", action.title);
			case "note":
				return openNote(action.id);
			case "copy":
				return copyPairs(pairs, action.what);
			case "narrow":
				return narrow(action.term);
			case "hide-type":
				return hideType(action.contentType);
			case "select":
				return selectSimilar(pairs, action.kind);
			case "metadata":
				return openMetadata(action.id);
		}
	}

	// Opens the row menu at a point, on the selection.
	function openRowMenu(x, y) {
		const pairs = selectionPairs();
		if (pairs.length === 0) return;
		rowMenu = { open: true, x, y, pairs };
	}

	// Opens the row menu under the focused row, as ⌘. and the menu key do.
	function openRowMenuAtFocus() {
		if (!drawerOpen || $modalStore[0]) return;
		if (rowMenu.open) {
			rowMenu = { ...rowMenu, open: false };
			return;
		}
		table?.reveal(focusID);
		const rect = table?.rowRect(focusID) ?? tableArea?.getBoundingClientRect();
		if (!rect) return;
		openRowMenu(rect.left + 200, rect.bottom);
	}

	$: rowMenuContext = {
		numberOf: (pair) => ledgerStore.pairNumber(pair.ID),
		launchpads: $launchpadStore.launchpads,
		findings: $findingStore,
		testCases: $testCaseStore,
	};

	// A shortcut acts on the selection, as the row menu does.
	const onSelection = (fn) => () => {
		if (!drawerOpen) return;
		rowMenu = { ...rowMenu, open: false };
		const pairs = selectionPairs();
		if (pairs.length) fn(pairs);
	};

	// Opens the modal, or closes it when the same one is already open.
	function toggleModal(component, modal) {
		if (!$modalStore[0]) modalStore.trigger(modal);
		else if ($modalStore[0].component === component) modalStore.close();
	}

	function openNote(id) {
		ledgerStore.getNote(id).then((note) =>
			toggleModal("Notes", {
				type: "component",
				component: "Notes",
				toggleAction: "ledger.drawer-open.view-note",
				title: "Request " + ledgerStore.pairNumber(id) + " notes",
				requestID: id,
				content: note,
			}),
		);
	}

	function createTestCase(ids) {
		ledgerStore
			.createTestCase(ids)
			.then((testCase) =>
				modalStore.trigger({
					type: "component",
					component: "TestCase",
					toggleAction: "ledger.drawer-open.create-test-case",
					meta: { testCase, isNew: true },
				}),
			)
			.catch((error) => toastError("Failed to create a test case", error));
	}

	function createFinding(ids) {
		ledgerStore
			.createFinding(ids)
			.then((finding) =>
				modalStore.trigger({
					type: "component",
					component: "Finding",
					toggleAction: "ledger.drawer-open.create-finding",
					meta: { finding, isNew: true },
				}),
			)
			.catch((error) => toastError("Failed to create a finding", error));
	}

	// Focuses `element`, or blurs it when it already has focus.
	function toggleFocus(element) {
		if (!element) return;
		if (document.activeElement === element) element.blur();
		else element.focus();
	}

	const toggleSidebar = {
		icon: PanelLeftIcon,
		handler: () => dock?.toggle(),
	};

	let ledgerMenu = [
		{
			actionId: "ledger.drawer-closed.toggle-settings",
			icon: ToggleLeftIcon,
			handler: () => (queryFieldsOpen = !queryFieldsOpen),
		},
		{
			actionId: "ledger.drawer-closed.focus-query",
			icon: SearchIcon,
			handler: () => toggleFocus(document.getElementById("searchBox")),
		},
		{
			actionId: "ledger.drawer-closed.focus-exclusion",
			icon: FilterIcon,
			handler: () => typesMenu?.focusFind(),
		},
		{
			actionId: "ledger.drawer-closed.next-page",
			icon: ArrowRightIcon,
			handler: () => table?.page(1),
		},
		{
			actionId: "ledger.drawer-closed.previous-page",
			icon: ArrowLeftIcon,
			handler: () => table?.page(-1),
		},
		{
			actionId: "ledger.drawer-closed.open-request",
			icon: SquareArrowUpRightIcon,
			handler: () => {
				if (drawerOpen) return;
				new Promise((resolve) => {
					toggleModal("MenuInput", {
						type: "component",
						component: "MenuInput",
						toggleAction: "ledger.drawer-closed.open-request",
						title: "Open request",
						response: resolve,
					});
				}).then((requestIndex) => {
					if (!requestIndex) return;
					const pair = ledgerStore.shownPairAtNumber(parseInt(requestIndex));
					if (pair) selectAndReveal(pair.ID);
				});
			},
		},
		{ actionId: "ledger.drawer-closed.toggle-sidebar", ...toggleSidebar },
	];

	// Each drawer action works on the focused pair.
	const whenOpen = (fn) => () => {
		if (drawerOpen) fn($focused.ID);
	};

	let drawerMenu = [
		{
			actionId: "ledger.drawer-open.next-request",
			icon: ArrowRightIcon,
			handler: whenOpen(() => {
				modalStore.close();
				ledgerStore.stepSelection(1);
			}),
		},
		{
			actionId: "ledger.drawer-open.send-to-armory",
			icon: Swords,
			handler: onSelection(sendToArmory),
		},
		{
			actionId: "ledger.drawer-open.previous-request",
			icon: ArrowLeftIcon,
			handler: whenOpen(() => {
				modalStore.close();
				ledgerStore.stepSelection(-1);
			}),
		},
		{
			actionId: "ledger.drawer-open.send-to-launchpad",
			icon: SendIcon,
			handler: onSelection(sendToNewLaunchpad),
		},
		{
			actionId: "ledger.drawer-open.create-test-case",
			icon: BookCheckIcon,
			handler: whenOpen(() => {
				if (!$modalStore[0]) createTestCase(idsOf(selectionPairs()));
				else if ($modalStore[0].component === "TestCase") modalStore.close();
			}),
		},
		{
			actionId: "ledger.drawer-open.link-test-case",
			icon: LinkIcon,
			handler: whenOpen((id) => {
				if ($modalStore[0]) {
					if ($modalStore[0].component === "SelectTestCase") modalStore.close();
					return;
				}
				if ($testCaseStore.length === 0) {
					toastStore.trigger({
						message: "No existing test cases found...",
						background: "variant-filled-warning",
					});
					return;
				}
				modalStore.trigger({
					type: "component",
					component: "SelectTestCase",
					toggleAction: "ledger.drawer-open.link-test-case",
					meta: { requestID: id, mode: "link" },
				});
			}),
		},
		{
			actionId: "ledger.drawer-open.unlink-test-case",
			icon: Unlink,
			handler: whenOpen((id) => {
				if ($modalStore[0]) {
					if ($modalStore[0].component === "SelectTestCase") modalStore.close();
					return;
				}
				if (!$testCaseStore.some((tc) => tc.Requests?.includes(id))) {
					toastStore.trigger({
						message: "No test cases linked to this request.",
						background: "variant-filled-warning",
					});
					return;
				}
				modalStore.trigger({
					type: "component",
					component: "SelectTestCase",
					toggleAction: "ledger.drawer-open.unlink-test-case",
					meta: { requestID: id, mode: "unlink" },
				});
			}),
		},
		{
			actionId: "ledger.drawer-open.create-finding",
			icon: ShieldAlertIcon,
			handler: whenOpen(() => {
				if (!$modalStore[0]) createFinding(idsOf(selectionPairs()));
				else if ($modalStore[0].component === "Finding") modalStore.close();
			}),
		},
		{
			actionId: "ledger.drawer-open.link-finding",
			icon: LinkIcon,
			handler: whenOpen((id) => {
				if ($modalStore[0]) {
					if ($modalStore[0].component === "SelectFinding") modalStore.close();
					return;
				}
				if ($findingStore.length === 0) {
					toastStore.trigger({
						message: "No existing findings found...",
						background: "variant-filled-warning",
					});
					return;
				}
				modalStore.trigger({
					type: "component",
					component: "SelectFinding",
					toggleAction: "ledger.drawer-open.link-finding",
					meta: { requestID: id, mode: "link" },
				});
			}),
		},
		{
			actionId: "ledger.drawer-open.unlink-finding",
			icon: Unlink,
			handler: whenOpen((id) => {
				if ($modalStore[0]) {
					if ($modalStore[0].component === "SelectFinding") modalStore.close();
					return;
				}
				if (!$findingStore.some((fnd) => fnd.Requests?.includes(id))) {
					toastStore.trigger({
						message: "No findings linked to this request.",
						background: "variant-filled-warning",
					});
					return;
				}
				modalStore.trigger({
					type: "component",
					component: "SelectFinding",
					toggleAction: "ledger.drawer-open.unlink-finding",
					meta: { requestID: id, mode: "unlink" },
				});
			}),
		},
		{
			actionId: "ledger.drawer-open.view-note",
			icon: PenIcon,
			handler: whenOpen(openNote),
		},
		{
			actionId: "ledger.drawer-open.view-metadata",
			icon: BracesIcon,
			handler: whenOpen(openMetadata),
		},
		{
			actionId: "ledger.drawer-open.copy-url",
			icon: CopyIcon,
			handler: onSelection((pairs) => copyPairs(pairs, "urls")),
		},
		{
			actionId: "ledger.drawer-open.copy-raw-request",
			icon: CopyIcon,
			handler: onSelection((pairs) => copyPairs(pairs, "requests")),
		},
		{
			actionId: "ledger.drawer-open.copy-raw-response",
			icon: CopyIcon,
			handler: onSelection((pairs) => copyPairs(pairs, "responses")),
		},
		{
			actionId: "ledger.drawer-open.open-row-menu",
			icon: MenuIcon,
			handler: openRowMenuAtFocus,
		},
		{
			actionId: "ledger.drawer-open.toggle-fullscreen",
			icon: MaximizeIcon,
			handler: () => ledgerStore.toggleDrawerMaximised(),
		},
		{
			actionId: "ledger.drawer-open.toggle-word-wrap",
			icon: WrapTextIcon,
			handler: () => ($lineWrap = !$lineWrap),
		},
		{ actionId: "ledger.drawer-open.toggle-sidebar", ...toggleSidebar },
	];
	const websocketDrawerMenuItem = {
		actionId: "ledger.drawer-open.websocket.open-stream",
		icon: RadioIcon,
		handler: openWebSocketStream,
	};

	// Every Ledger action stays registered; the drawer-closed, drawer-open and
	// WebSocket-upgrade menu contexts decide which ones a key reaches.
	useMenuActions([...ledgerMenu, websocketDrawerMenuItem, ...drawerMenu]);
	// The menu lists the actions of the drawer's current state.
	$: menuOptions = !$drawerKeys.open
		? ledgerMenu
		: canOpenDrawerStream($drawerKeys.meta)
			? [websocketDrawerMenuItem, ...drawerMenu]
			: drawerMenu;

	// Appends a field-list example to the query box and runs it like typing.
	function insertQueryExample(example) {
		const text = appendToQuery($queryText, example);
		ledgerStore.setQueryText(text);
		ledgerStore.scheduleQuery(text);
		document.getElementById("searchBox")?.focus();
	}

	// The Marks menu's counts, read each time it opens.
	let markCounts = {};
	let markCountsRead = 0;
	async function loadMarkCounts() {
		const read = ++markCountsRead;
		markCounts = {};
		const counts = await ledgerStore.countQueries(MARKS.map((mark) => mark.term));
		if (read === markCountsRead) markCounts = counts;
	}
	$: activeMarks = activeMarkCount($queryText);

	// Runs the query after a sitemap choice: choosing a node narrows to it
	// (again removes it), the eye-off button leaves it out.
	function applySitemapChoice(text) {
		if (!text.trim()) return ledgerStore.clearQuery();
		ledgerStore.setQueryText(text);
		ledgerStore.runQuery(text);
	}

	// Runs a saved query the menu chose, or returns to the live view for "".
	function applySavedQuery(text) {
		if (!text) return ledgerStore.clearQuery();
		ledgerStore.setQueryText(text);
		ledgerStore.runQuery(text);
	}

	// Closes the toolbar's panels on a click outside them.
	function onWindowPointerDown(event) {
		if (queryFieldsOpen && !event.target.closest?.(".ledger-query-fields, #ledgerQueryFieldsToggle")) {
			queryFieldsOpen = false;
		}
	}
</script>

<svelte:window on:keydown={onWindowKeydown} on:pointerdown={onWindowPointerDown} />
<MarasiKeys {menuOptions} />

<div class="ledger-page relative flex h-full min-h-0 overflow-hidden">
	<Dock
		bind:this={dock}
		state={ledgerStore.dockState}
		limits={LEDGER_DOCK}
		stripLabel={stripLabel(sitemapNode)}
		expandLabel="Show the sitemap"
		searchLabel="Search the sitemap"
		collapseLabel="Collapse the sitemap"
		searchInput={sitemapFind}
	>
		<LedgerSitemap
			store={sitemapStore}
			activeNode={sitemapNode}
			bind:findInput={sitemapFind}
			on:choose={(e) => applySitemapChoice(chooseSitemapNode($queryText, e.detail))}
			on:exclude={(e) => applySitemapChoice(excludeSitemapNode($queryText, e.detail))}
		/>
	</Dock>

	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Toolbar: the query box, then the menus. Saved queries and
		     Highlights join it before Marks. -->
		<div
			class="ledger-toolbar relative flex h-11 flex-none items-stretch border-b border-surface-300-600-token bg-surface-100-800-token"
		>
			<div class="flex min-w-0 flex-1 items-center gap-2 pl-3">
				{#if $queryPending}
					<LoaderCircle size={15} class="shrink-0 animate-spin opacity-70" />
				{:else}
					<Search size={15} class="shrink-0 opacity-70" />
				{/if}
				<LedgerQueryBox
					value={$queryText}
					error={queryBoxError}
					readyMade={$readyMadeQueries}
					on:change={(e) => {
						ledgerStore.setQueryText(e.detail);
						ledgerStore.scheduleQuery(e.detail);
					}}
					on:run={() => ledgerStore.runQuery($queryText)}
					on:clear={() => ledgerStore.clearQuery()}
				/>
				{#if queryBoxError}
					<span
						id="ledgerQueryError"
						class="flex max-w-[24rem] items-center gap-1 text-xs text-error-500"
						role="alert"
						title={queryBoxError.position
							? `Position ${queryBoxError.position}: ${queryBoxError.message}`
							: queryBoxError.message}
						><CircleAlert size={14} class="shrink-0" /><span class="truncate"
							>{queryBoxError.message}</span
						></span
					>
				{:else if $queryActive}
					<span id="ledgerQueryMatchCount" class="whitespace-nowrap text-xs opacity-70"
						>{$statusCount}</span
					>
					{#if $indexNote}
						<span class="text-warning-500" title={$indexNote}><TriangleAlert size={14} /></span>
					{/if}
				{/if}
				{#if $queryText}
					<button
						id="ledgerQueryClear"
						type="button"
						class="opacity-70 hover:opacity-100"
						title="Clear query (Esc)"
						aria-label="Clear query"
						on:click={() => ledgerStore.clearQuery()}
					>
						<X size={15} />
					</button>
				{/if}
				<button
					id="ledgerQueryFieldsToggle"
					type="button"
					class="btn btn-sm px-2 {queryFieldsOpen ? primary : 'opacity-70 hover:opacity-100'}"
					title="Query fields"
					aria-label="Query fields"
					aria-expanded={queryFieldsOpen}
					aria-controls="ledgerQueryFields"
					on:click={() => (queryFieldsOpen = !queryFieldsOpen)}
				>
					<CircleHelp size={15} />
				</button>
			</div>
			<SavedQueriesMenu
				queryText={$queryText}
				valid={$queryActive && !$queryPending && !queryBoxError && $query.ranQuery === $queryText}
				on:apply={(e) => applySavedQuery(e.detail)}
			/>
			<ToolbarMenu
				id="ledgerMarks"
				label="Marks"
				icon={Tags}
				title="Pairs with a note or a link"
				badge={activeMarks ? String(activeMarks) : ""}
				panelClass="w-64"
				on:open={loadMarkCounts}
			>
				<MarksMenu
					queryText={$queryText}
					counts={markCounts}
					on:toggle={(e) => ledgerStore.toggleQueryTerm(e.detail)}
				/>
			</ToolbarMenu>
			<LedgerTypesMenu bind:this={typesMenu} />
			{#if queryFieldsOpen}
				<div
					id="ledgerQueryFields"
					class="ledger-query-fields card absolute left-2 top-full z-40 mt-1 max-h-[50vh] w-[40rem] max-w-[90%] overflow-auto p-3 shadow-xl"
				>
					<QueryFieldList on:insert={(e) => insertQueryExample(e.detail)} />
				</div>
			{/if}
		</div>

		<!-- The table, and the drawer below it while a pair is selected. -->
		<div class="relative flex min-h-0 flex-1 flex-col" bind:this={tableArea}>
			{#if !(drawerOpen && $drawerLayout.maximised)}
				<div
					class="relative min-h-0"
					style="flex: {drawerOpen ? 1 - $drawerLayout.split : 1} 1 0"
				>
					<LedgerTable
						bind:this={table}
						rows={$rows}
						focusId={focusID}
						selectedIds={$selection.ids}
						palette={$highlightPalette}
						{firstNumber}
						sort={$sort}
						pinTop={$newKind === "top" && !$results.hasBefore}
						resetKey={$results.reset}
						on:click={(e) => ledgerStore.clickRow(e.detail.id, e.detail)}
						on:sweepstart={(e) => ledgerStore.startSweep(e.detail)}
						on:sweep={(e) => ledgerStore.sweepTo(e.detail)}
						on:sweepend={() => ledgerStore.endSweep()}
						on:step={(e) => ledgerStore.stepSelection(e.detail.step, { extend: e.detail.extend })}
						on:selectall={() => ledgerStore.selectAll()}
						on:menukey={openRowMenuAtFocus}
						on:viewport={(e) => ledgerStore.setViewport(e.detail)}
						on:sort={(e) => ledgerStore.sortBy(e.detail)}
						on:menu={(e) => {
							ledgerStore.contextRow(e.detail.id);
							openRowMenu(e.detail.event.clientX, e.detail.event.clientY);
						}}
					/>
				</div>
			{/if}
			{#if drawerOpen}
				{#if !$drawerLayout.maximised}
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<div
						class="ledger-drawer-resize h-1 flex-none cursor-row-resize border-t border-primary-500 hover:bg-primary-500/50"
						title="Drag to resize the drawer"
						on:pointerdown={startDrawerResize}
					></div>
				{/if}
				<div class="min-h-0" style="flex: {$drawerLayout.maximised ? 1 : $drawerLayout.split} 1 0">
					<LedgerDrawer
						pair={$focused}
						number={focusNumber}
						incomingResponse={$selection.incomingResponse}
						maximised={$drawerLayout.maximised}
						highlight={rowHighlight($focused, $highlightPalette)}
						on:step={(e) => ledgerStore.stepSelection(e.detail)}
						on:maximise={() => ledgerStore.toggleDrawerMaximised()}
						on:close={closeDrawer}
					/>
				</div>
			{/if}
			{#if $newLabel && !(drawerOpen && $drawerLayout.maximised)}
				<div class="pointer-events-none absolute left-0 right-0 top-8 z-20 flex justify-center">
					{#if $newKind === "top"}
						<button
							id="ledgerNewMatches"
							type="button"
							class="btn btn-sm pointer-events-auto rounded-full py-0.5 text-xs shadow-lg {primary}"
							title="Back to the top"
							on:click={showNewAtTop}
						>
							{$newLabel}
						</button>
					{:else}
						<button
							id="ledgerNewMatches"
							type="button"
							class="btn btn-sm pointer-events-auto rounded-full py-0.5 text-xs shadow-lg {primary}"
							title="Show them, keeping your place"
							on:click={() => ledgerStore.showNewMatches()}
						>
							{$newLabel} · Show
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Status bar -->
		<div
			class="ledger-status flex h-6 flex-none items-center gap-4 border-t border-surface-300-600-token bg-surface-100 px-3 text-[11px] tabular-nums dark:bg-surface-800"
		>
			<span id="ledgerCount" class="opacity-80">{$statusCount}</span>
			{#if $hiddenCount}
				<span class="opacity-60">{$hiddenCount.toLocaleString()} hidden by type</span>
			{/if}
			{#if drawerOpen}
				<span id="ledgerSelectionCount" class="text-primary-500">
					{#if selectedCount === 1}
						Request {focusNumber} selected
					{:else if allSelected}
						All {selectedCount.toLocaleString()} selected
					{:else}
						{selectedCount.toLocaleString()} selected
					{/if}
				</span>
				<button class="opacity-70 hover:underline" on:click={closeDrawer}>Clear</button>
			{/if}
			<span class="ml-auto truncate opacity-50">
				⇧-click range · ⌘-click toggle · drag to sweep · ⌘A all · right-click for actions
			</span>
		</div>
	</div>
</div>

<RowMenu
	bind:open={rowMenu.open}
	x={rowMenu.x}
	y={rowMenu.y}
	pairs={rowMenu.pairs}
	context={rowMenuContext}
	on:action={(e) => runMenuAction(e.detail, rowMenu.pairs)}
	on:close={(e) => e.detail.refocus && table?.focus()}
/>

