<script>
	// The Ledger: the sitemap dock (full height), then a one-row toolbar, the
	// windowed table, the drawer below it while a pair is selected, and the
	// status bar. Its state lives in the Ledger store, so the layout and the
	// selection survive page visits.
	import { goto } from "$app/navigation";
	import { contentTypeFilterInput, lineWrap } from "../../stores";
	import ContextMenu, { Item, Divider } from "svelte-contextmenu";
	import {
		getModalStore,
		getToastStore,
		InputChip,
		ListBoxItem,
		ListBox,
		modeCurrent,
	} from "@skeletonlabs/skeleton";
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
		FileType,
	} from "lucide-svelte";
	import QueryFieldList from "../../lib/components/QueryFieldList.svelte";
	import LedgerQueryBox from "../../lib/ledger/LedgerQueryBox.svelte";
	import { appendToQuery } from "../../lib/ledgerQueryFields";
	import MarasiKeys from "../../lib/components/MarasiMenu/MarasiKeys.svelte";
	import { useMenuActions } from "../../lib/keybindings/app.js";
	import { canOpenDrawerStream } from "../../lib/websocket/presentation.js";
	import Dock from "../../lib/dock/Dock.svelte";
	import { LEDGER_DOCK } from "../../lib/dock/dock.js";
	import LedgerTable from "../../lib/ledger/LedgerTable.svelte";
	import LedgerDrawer from "../../lib/ledger/LedgerDrawer.svelte";
	import { rowHighlight } from "../../lib/ledger/table.js";
	import { primaryVariant } from "../../lib/launchpad/format.js";
	import { highlightPalette } from "../../stores/highlightsStore";
	import { testCaseStore } from "../../stores/testCaseStore";
	import { findingStore } from "../../stores/findingStore";
	import { armoryStore } from "../../stores/armoryStore";
	import {
		ledgerStore,
		select,
		tableRows,
		hiddenByTypeCount,
		focusedPair,
		drawerKeybindingState,
		isQueryActive,
		canLoadOlder,
		matchNoun,
		matchCountLabel,
		indexWarning,
	} from "../../stores/ledgerStore";

	// The parts of the Ledger store the page follows. Each notifies only when
	// its own value changes.
	const rows = select(ledgerStore, tableRows);
	const hiddenCount = select(ledgerStore, hiddenByTypeCount);
	const query = select(ledgerStore, (state) => state.query);
	const queryText = select(ledgerStore, (state) => state.queryText);
	const queryPending = select(ledgerStore, (state) => state.queryPending);
	const queryActive = select(ledgerStore, (state) => isQueryActive(state.query));
	const exclusion = select(ledgerStore, (state) => state.exclusion);
	const selection = select(ledgerStore, (state) => state.selection);
	const focused = select(ledgerStore, focusedPair);
	const drawerLayout = select(ledgerStore, (state) => state.layout.drawer);
	const drawerKeys = select(ledgerStore, drawerKeybindingState);

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	let dock;
	let table;
	let tableArea;
	let contextMenu;
	let contextPairID;
	let queryFieldsOpen = false;
	let typesOpen = false;

	$: primary = primaryVariant($modeCurrent);
	$: drawerOpen = Boolean($focused);
	$: focusID = $selection.focus;
	$: focusNumber = $focused ? ledgerStore.pairNumber($focused.ID) : "";
	// Marasi's error for the text in the query box, underlined there; an
	// error for text since edited is stale.
	$: queryBoxError = $query.error?.query === $queryText ? $query.error : null;
	$: liveCount = $rows.length;

	const numberOf = (row) => ledgerStore.pairNumber(row.ID);

	// The toast style the Ledger's handoffs use.
	$: handoffBackground = $modeCurrent
		? "bg-surface-50 text-surface-900 border border-surface-300"
		: "bg-surface-100 text-surface-900";

	// Reaching the end of the loaded query results loads the next older
	// page. The table fires again after each load while it stays near the
	// end, so pages that come back short keep loading.
	function onNearEnd() {
		if (canLoadOlder($query)) ledgerStore.loadOlderPage();
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

	async function sendFocusedToArmory() {
		if (!drawerOpen) return;
		const number = focusNumber;
		try {
			const template = await armoryStore.createTemplateFromRequest($focused.ID);
			const toastId = toastStore.trigger({
				message: `Request ${number} sent to Armory`,
				background: handoffBackground,
				action: {
					label: "Jump to Armory",
					response: () => {
						toastStore.close(toastId);
						goto(`/armory?id=${template.ID}`);
					},
				},
			});
		} catch (error) {
			toastStore.trigger({
				message: `Failed to send request to Armory: ${String(error)}`,
				background: "variant-filled-error",
			});
		}
	}

	function sendToLaunchpad(id) {
		const number = ledgerStore.pairNumber(id);
		ledgerStore.sendToLaunchpad(id).then((launchpadId) => {
			const toastId = toastStore.trigger({
				message: "Request " + number + " sent to Launchpad",
				background: handoffBackground,
				action: {
					label: "Jump to Launchpad",
					response: () => {
						toastStore.close(toastId);
						goto("/launchpad?id=" + launchpadId);
					},
				},
			});
		});
	}

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

	function createTestCase(id) {
		testCaseStore.create([id]).then((testCase) =>
			modalStore.trigger({
				type: "component",
				component: "TestCase",
				toggleAction: "ledger.drawer-open.create-test-case",
				meta: { testCase, isNew: true },
			}),
		);
	}

	function createFinding(id) {
		findingStore
			.create([id])
			.then((finding) =>
				modalStore.trigger({
					type: "component",
					component: "Finding",
					toggleAction: "ledger.drawer-open.create-finding",
					meta: { finding, isNew: true },
				}),
			)
			.catch((err) => console.log(err));
	}

	// Focuses `element`, or blurs it when it already has focus.
	function toggleFocus(element) {
		if (!element) return;
		if (document.activeElement === element) element.blur();
		else element.focus();
	}

	function exclusionInput() {
		return document.querySelector('input[placeholder="Filter by Content Type"]');
	}

	async function toggleExclusionFocus() {
		if (!typesOpen) {
			typesOpen = true;
			await Promise.resolve();
			setTimeout(() => exclusionInput()?.focus(), 0);
			return;
		}
		const input = exclusionInput();
		if (document.activeElement === input) {
			input.blur();
			typesOpen = false;
		} else input?.focus();
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
			handler: toggleExclusionFocus,
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
			handler: sendFocusedToArmory,
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
			handler: whenOpen(sendToLaunchpad),
		},
		{
			actionId: "ledger.drawer-open.create-test-case",
			icon: BookCheckIcon,
			handler: whenOpen((id) => {
				if (!$modalStore[0]) createTestCase(id);
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
			handler: whenOpen((id) => {
				if (!$modalStore[0]) createFinding(id);
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
			handler: whenOpen((id) => {
				ledgerStore.getMetadata(id).then((metadata) =>
					toggleModal("Metadata", {
						type: "component",
						component: "Metadata",
						toggleAction: "ledger.drawer-open.view-metadata",
						content: metadata,
						title: "Request " + ledgerStore.pairNumber(id) + " Metadata",
					}),
				);
			}),
		},
		{
			actionId: "ledger.drawer-open.copy-url",
			icon: CopyIcon,
			handler: whenOpen(() => {
				const pair = $focused;
				copyText(
					pair.Scheme + "://" + pair.Host + pair.Path,
					"URL copied to clipboard",
					"Failed to copy URL",
				);
			}),
		},
		{
			actionId: "ledger.drawer-open.copy-raw-request",
			icon: CopyIcon,
			handler: whenOpen(() =>
				focusedDetails().then((details) =>
					copyText(details.Request?.Raw, "Request copied to clipboard", "Failed to copy request"),
				),
			),
		},
		{
			actionId: "ledger.drawer-open.copy-raw-response",
			icon: CopyIcon,
			handler: whenOpen(() =>
				focusedDetails().then((details) =>
					copyText(
						($selection.incomingResponse || details.Response)?.Raw,
						"Response copied to clipboard",
						"Failed to copy response",
					),
				),
			),
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

	// The content-type chips edit a copy of the exclusion, refreshed whenever
	// the store's exclusion changes.
	let exclusionDraft = [];
	let draftedExclusion;
	$: if ($exclusion !== draftedExclusion) {
		draftedExclusion = $exclusion;
		exclusionDraft = [...$exclusion];
	}

	// Stores the content-type exclusion, then runs the active query again so
	// its results reflect it. The query reads the stored exclusion itself.
	function saveContentTypeExclusion() {
		return ledgerStore.saveExclusion(exclusionDraft);
	}

	// Closes the toolbar's panels on a click outside them.
	function onWindowPointerDown(event) {
		if (typesOpen && !event.target.closest?.(".ledger-types")) typesOpen = false;
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
		stripLabel="Sitemap"
		expandLabel="Show the sitemap"
		searchLabel="Search the sitemap"
		collapseLabel="Collapse the sitemap"
	>
		<!-- The sitemap arrives with ticket 12. -->
		<div class="ledger-sitemap flex h-full flex-col">
			<div class="border-b border-surface-500/30 px-3 py-2 text-xs font-semibold">Sitemap</div>
			<div class="flex flex-1 items-center justify-center p-4 text-center text-xs opacity-50">
				The sitemap will appear here.
			</div>
		</div>
	</Dock>

	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Toolbar: the query box, then the menus. Saved queries, Highlights
		     and Marks join it before Types. -->
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
						>{matchCountLabel($query)}</span
					>
					{#if indexWarning($query)}
						<span class="text-warning-500" title={indexWarning($query)}><TriangleAlert size={14} /></span>
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
			<div class="ledger-types relative flex items-stretch border-l border-surface-300-600-token">
				<button
					type="button"
					class="flex items-center gap-1.5 px-3 text-sm hover:bg-surface-200-700-token"
					title="Content types the Ledger hides"
					aria-expanded={typesOpen}
					on:click={() => (typesOpen = !typesOpen)}
				>
					<FileType size={15} class="opacity-70" />
					Types
					{#if $exclusion.length}
						<span class="badge {primary} px-1.5 py-0 text-[10px]">{$exclusion.length}</span>
					{/if}
				</button>
				{#if typesOpen}
					<div
						class="card absolute right-0 top-full z-40 mt-1 max-h-[60vh] w-96 space-y-2 overflow-auto p-3 shadow-xl"
						role="dialog"
						aria-label="Hidden content types"
					>
						<div class="text-xs opacity-70">Hidden content types</div>
						<InputChip
							bind:input={$contentTypeFilterInput}
							bind:value={exclusionDraft}
							name="chips"
							placeholder="Filter by Content Type"
							rounded="none"
							on:add={saveContentTypeExclusion}
							on:remove={saveContentTypeExclusion}
						/>
					</div>
				{/if}
			</div>
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
						palette={$highlightPalette}
						{numberOf}
						on:select={(e) => ledgerStore.selectPair(e.detail)}
						on:step={(e) => ledgerStore.stepSelection(e.detail)}
						on:nearend={onNearEnd}
						on:menu={(e) => {
							contextPairID = e.detail.id;
							contextMenu.show(e.detail.event);
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
			{#if $queryActive && $query.newMatches.length > 0}
				<div class="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center">
					<button
						type="button"
						class="btn btn-sm pointer-events-auto shadow-lg {primary}"
						on:click={ledgerStore.mergeNewMatches}
					>
						{$query.newMatches.length.toLocaleString()}
						new {matchNoun($query.newMatches.length)}
					</button>
				</div>
			{/if}
		</div>

		<!-- Status bar -->
		<div
			class="ledger-status flex h-6 flex-none items-center gap-4 border-t border-surface-300-600-token bg-surface-100 px-3 text-[11px] tabular-nums dark:bg-surface-800"
		>
			<span class="opacity-80">
				{#if $queryActive}
					{liveCount.toLocaleString()}{$query.nextCursor ? "+" : ""} matching
				{:else}
					{liveCount.toLocaleString()} in the live view
				{/if}
			</span>
			{#if $hiddenCount}
				<span class="opacity-60">{$hiddenCount.toLocaleString()} hidden by type</span>
			{/if}
			{#if drawerOpen}
				<span class="text-primary-500">Request {focusNumber} selected</span>
				<button class="opacity-70 hover:underline" on:click={closeDrawer}>Clear</button>
			{/if}
		</div>
	</div>
</div>

<ContextMenu bind:this={contextMenu}>
	<Item on:click={() => openNote(contextPairID)}>Open Note</Item>
	<Item on:click={() => sendToLaunchpad(contextPairID)}>Send to Launchpad</Item>
	<Item on:click={() => createTestCase(contextPairID)}>Create Test Case</Item>
	<Item on:click={() => createFinding(contextPairID)}>Create Finding</Item>
	<Divider />
	<ListBox active="">
		<ListBoxItem
			group
			name
			value
			on:click={() => ledgerStore.highlight(contextPairID, 0xef4444)}
			class="!bg-red-500 text-black hover:brightness-110">Red</ListBoxItem
		>
		<ListBoxItem
			group
			name
			value
			on:click={() => ledgerStore.highlight(contextPairID, 0x22c55e)}
			class="!bg-green-500 text-black hover:brightness-110">Green</ListBoxItem
		>
		<ListBoxItem
			group
			name
			value
			on:click={() => ledgerStore.highlight(contextPairID, 0xeab308)}
			class="!bg-yellow-500 text-black hover:brightness-110">Yellow</ListBoxItem
		>
		<ListBoxItem
			group
			name
			value
			on:click={() => ledgerStore.highlight(contextPairID, 0x3b82f6)}
			class="!bg-blue-500 text-black hover:brightness-110">Blue</ListBoxItem
		>
		<ListBoxItem
			group
			name
			value
			on:click={() => ledgerStore.highlight(contextPairID, 0xa855f7)}
			class="!bg-purple-500 text-black hover:brightness-110">Purple</ListBoxItem
		>
		<ListBoxItem
			group
			name
			value
			on:click={() => ledgerStore.highlight(contextPairID, -1)}
			class="context-menu-none">None</ListBoxItem
		>
	</ListBox>
</ContextMenu>
