<script>
	// The Ledger drawer: the focused pair, request and response side by
	// side, under a one-line summary with previous/next, maximise and close.
	import { createEventDispatcher } from "svelte";
	import { ChevronDown, ChevronUp, Maximize2, Minimize2, X } from "lucide-svelte";
	import RequestResponseView from "../components/RequestResponseView.svelte";
	import { statusClass } from "../launchpad/format.js";
	import { groupBuilding, jobsStore } from "../../stores/jobsStore";

	/** The focused pair's table row. */
	export let pair;
	/** Its request number. */
	export let number;
	/** Its response, when it arrived after the pair was selected. */
	export let incomingResponse = null;
	export let maximised = false;
	/** The highlight colour, or null. */
	export let highlight = null;

	const dispatch = createEventDispatcher();
	// Marasi is still moving older pairs' prettified copies out of metadata.
	$: prettifiedMoving = groupBuilding($jobsStore, "prettified");
</script>

<div class="ledger-drawer flex h-full min-h-0 flex-col bg-surface-50 dark:bg-surface-800">
	<div
		class="flex h-8 flex-none items-center gap-2 border-b border-surface-300-600-token px-3 font-mono text-[11px]"
	>
		{#if highlight}
			<span class="h-2.5 w-2.5 flex-none rounded-full" style="background: {highlight}"></span>
		{/if}
		<span class="opacity-60">#{number}</span>
		<span>{pair.Method ?? ""}</span>
		<span class="min-w-0 flex-1 truncate" title="{pair.Host}{pair.Path}"
			>{pair.Host ?? ""}<span class="opacity-70">{pair.Path ?? ""}</span></span
		>
		<span class={statusClass(pair.StatusCode)}>{pair.StatusCode || "pending"}</span>
		{#if prettifiedMoving}
			<span
				class="ledger-prettified-moving whitespace-nowrap font-sans text-warning-600 dark:text-warning-400"
				title="Marasi is still moving older formatted bodies, so some may not show prettified yet"
				>Some formatted bodies still moving</span
			>
		{/if}
		<div class="flex items-center gap-1 border-l border-surface-300-600-token pl-2">
			<button
				class="opacity-60 hover:opacity-100"
				title="Previous request"
				aria-label="Previous request"
				on:click={() => dispatch("step", -1)}><ChevronUp size={14} /></button
			>
			<button
				class="opacity-60 hover:opacity-100"
				title="Next request"
				aria-label="Next request"
				on:click={() => dispatch("step", 1)}><ChevronDown size={14} /></button
			>
			<button
				class="opacity-60 hover:opacity-100"
				title={maximised ? "Restore the table" : "Maximise the drawer"}
				aria-label={maximised ? "Restore the table" : "Maximise the drawer"}
				aria-pressed={maximised}
				on:click={() => dispatch("maximise")}
			>
				{#if maximised}<Minimize2 size={13} />{:else}<Maximize2 size={13} />{/if}
			</button>
			<button
				class="opacity-60 hover:opacity-100"
				title="Close (Esc)"
				aria-label="Close the drawer"
				on:click={() => dispatch("close")}><X size={14} /></button
			>
		</div>
	</div>
	<div class="min-h-0 flex-1 overflow-auto">
		<RequestResponseView
			request_id={pair.ID}
			titleText={"Request " + number}
			showArmoryAction={true}
			incomingResponse={incomingResponse ?? undefined}
		/>
	</div>
</div>
