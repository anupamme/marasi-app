<script>
	// The Ledger drawer: the focused pair, request and response side by side
	// in CodeMirror, with the rail (or, expanded, the details column) on the
	// left. The note or the metadata opens in place of the response, beside
	// the request it is about. The pair is read in full through the Ledger
	// store; the page runs the actions the rail dispatches.
	import { createEventDispatcher } from "svelte";
	import { javascript } from "@codemirror/lang-javascript";
	import { X } from "lucide-svelte";
	import DrawerEditor from "./DrawerEditor.svelte";
	import DrawerNote from "./DrawerNote.svelte";
	import DrawerRail from "./DrawerRail.svelte";
	import { drawerBodies, metadataText, pairTiming, usesSyntax } from "./drawer.js";
	import { sameID } from "./pairs.js";
	import { statusText } from "./table.js";
	import { lineWrap, marasiConfig, prettify } from "../../stores";
	import { groupBuilding, jobsStore } from "../../stores/jobsStore";

	/** The Ledger store: getDetails, getNote, getMetadata and saveNote. */
	export let store;
	/** The focused pair's table row. */
	export let pair;
	/** Its request number. */
	export let number;
	/** Its response, when it arrived after the pair was selected. */
	export let incomingResponse = null;
	export let maximised = false;
	/** Whether the details column shows instead of the rail. */
	export let expanded = false;
	/** "note" or "metadata" while one shows in place of the response; null for the response. */
	export let pane = null;
	/** The highlight colour, or null, and the palette. */
	export let highlight = null;
	export let palette = [];
	/** The findings and test cases that list the pair. */
	export let findings = [];
	export let testCases = [];
	/** Whether the pair is a WebSocket upgrade whose stream can open. */
	export let canOpenStream = false;

	const dispatch = createEventDispatcher();
	const jsonLanguage = javascript();

	// Marasi is still moving older pairs' prettified copies out of metadata.
	$: prettifiedMoving = groupBuilding($jobsStore, "prettified");

	// The full pair (GetRawDetails): undefined while it loads, null when the
	// read failed. A newer pair's read wins.
	let details;
	let detailsFor = null;
	$: loadDetails(pair.ID);
	async function loadDetails(id) {
		if (sameID(detailsFor, id)) return;
		detailsFor = id;
		details = undefined;
		const row = await store.getDetails(id).catch((error) => {
			console.error("Reading the request failed:", error);
			return null;
		});
		if (sameID(detailsFor, id)) details = row ?? null;
	}

	// The pair's note, null while it loads. It is read again whenever the
	// row is (a bulk note change rereads it), except while the note is open
	// here: the editor holds it then.
	let note = null;
	let noteFor = null;
	$: reloadNote(pair);
	async function reloadNote(row) {
		const id = row.ID;
		if (pane === "note" && sameID(noteFor, id)) return;
		if (!sameID(noteFor, id)) note = null;
		noteFor = id;
		const text = await store.getNote(id).catch((error) => {
			console.error("Reading the note failed:", error);
			return "";
		});
		if (sameID(noteFor, id) && !(pane === "note" && note !== null)) note = text ?? "";
	}
	function onNoteEdit(event) {
		if (sameID(event.detail.id, noteFor)) note = event.detail.text;
	}

	// The metadata, read when its pane opens.
	let metadata = null;
	let metadataFor = null;
	$: if (pane === "metadata") loadMetadata(pair.ID);
	else metadataFor = null;
	async function loadMetadata(id) {
		if (sameID(metadataFor, id)) return;
		metadataFor = id;
		metadata = null;
		const value = await store.getMetadata(id).catch((error) => {
			console.error("Reading the metadata failed:", error);
			return {};
		});
		if (sameID(metadataFor, id)) metadata = metadataText(value);
	}

	$: bodies = drawerBodies(details, { prettify: $prettify, incomingResponse });
	$: syntaxMode = $marasiConfig.SyntaxMode;
	$: responseStatus = incomingResponse?.StatusCode ?? pair.StatusCode;
	$: hasResponse = Boolean(bodies.response);

	const label =
		"pointer-events-none absolute right-4 top-1 z-10 bg-surface-500/20 px-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70";
	const message = "p-3 text-[12px] opacity-50";
</script>

<div class="ledger-drawer flex h-full min-h-0 bg-surface-50 text-[12px] dark:bg-surface-900">
	{#if highlight}
		<div class="ledger-drawer-highlight w-[3px] flex-none" style="background: {highlight}" title="Highlighted"></div>
	{/if}
	<DrawerRail
		{pair}
		{number}
		{expanded}
		{maximised}
		{palette}
		{note}
		{findings}
		{testCases}
		{pane}
		{canOpenStream}
		timing={pairTiming(incomingResponse ? { ...pair, RespondedAt: incomingResponse.RespondedAt } : pair)}
		bind:prettify={$prettify}
		bind:wrap={$lineWrap}
		on:expand
		on:step
		on:maximise
		on:close
		on:action
		on:highlight
		on:pane={(e) => (pane = e.detail)}
	/>
	<div class="flex min-w-0 flex-1 flex-col">
		{#if prettifiedMoving}
			<div
				class="ledger-prettified-moving flex-none whitespace-nowrap border-b border-surface-300-600-token px-3 py-0.5 text-[11px] text-warning-800 dark:text-warning-400"
				title="Marasi is still moving older formatted bodies, so some may not show prettified yet"
			>
				Some formatted bodies still moving
			</div>
		{/if}
		<div class="flex min-h-0 flex-1">
			<div class="ledger-drawer-request relative min-w-0 flex-1">
				<span class={label}>Request</span>
				{#if details === undefined}
					<p class={message}>Loading…</p>
				{:else if details === null}
					<p class={message}>Couldn't read this request.</p>
				{:else}
					<DrawerEditor
						value={bodies.request}
						lang={usesSyntax(bodies.request, syntaxMode) ? "http" : undefined}
						wrap={$lineWrap}
					/>
				{/if}
			</div>
			<div class="ledger-drawer-response relative flex min-w-0 flex-1 flex-col border-l border-surface-300-600-token">
				{#if pane === "note"}
					{#if note === null}
						<p class={message}>Loading the note…</p>
					{:else}
						{#key noteFor}
							<DrawerNote
								id={noteFor}
								{number}
								text={note}
								save={store.saveNote}
								on:edit={onNoteEdit}
								on:close={() => (pane = null)}
							/>
						{/key}
					{/if}
				{:else if pane === "metadata"}
					<div
						class="flex h-7 flex-none items-center gap-2 whitespace-nowrap border-b border-primary-500 bg-surface-100 px-3 text-[11px] dark:bg-surface-800"
					>
						<span class="font-semibold uppercase tracking-wide">Metadata</span>
						<span class="opacity-60">Request {number}</span>
						<span class="flex-1"></span>
						<button
							class="flex h-5 w-5 items-center justify-center hover:bg-surface-200-700-token"
							title="Back to the response"
							aria-label="Back to the response"
							on:click={() => (pane = null)}><X size={12} /></button
						>
					</div>
					<div class="ledger-drawer-metadata min-h-0 flex-1">
						{#if metadata === null}
							<p class={message}>Loading…</p>
						{:else}
							<DrawerEditor value={metadata} lang={jsonLanguage} wrap />
						{/if}
					</div>
				{:else}
					<span class={label}>Response{Number(responseStatus) > 0 ? ` ${statusText(responseStatus)}` : ""}</span>
					{#if details === undefined}
						<p class={message}>Loading…</p>
					{:else if hasResponse}
						<DrawerEditor
							value={bodies.response}
							lang={usesSyntax(bodies.response, syntaxMode) ? "http" : undefined}
							wrap={$lineWrap}
						/>
					{:else if details !== null}
						<p class={message}>Waiting for the response…</p>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>
