<script context="module">
	// Survives page visits so the grouping choice sticks while iterating.
	let savedGroupByStatus = false;
</script>

<script>
	// The Launchpad file tree: one scroll container, sticky launchpad rows,
	// each list windowed to its original entry plus the latest entries.
	// Row building lives in treeRows.js; this component only renders.
	import { modeCurrent, SlideToggle } from "@skeletonlabs/skeleton";
	import { afterUpdate } from "svelte";
	import { ArrowDown, ChevronDown, ChevronRight, Folder, FolderOpen, Plus, Search } from "lucide-svelte";
	import { isDraftDirty } from "../../stores/launchpadStore";
	import { entryRows, launchpadSummary, searchLaunchpads, STEP, WINDOW } from "./treeRows.js";
	import { jumpTarget } from "./jumpTarget.js";
	import { COMPARE_SIDES, compareSideOf } from "./compare.js";
	import { primaryVariant, shortTime, statusClass } from "./format.js";
	import OriginIcon from "./OriginIcon.svelte";

	export let store;
	export let pickLaunchpad;
	export let pickEntry;
	export let searchInput = null;

	export let groupByStatus = savedGroupByStatus;
	$: savedGroupByStatus = groupByStatus;

	let expanded = {};
	let shownByList = {};
	let openGroups = {};
	let creating = false;
	let newName = "";
	let newNameInput;

	$: primary = primaryVariant($modeCurrent);
	$: state = $store;
	$: results = searchLaunchpads(state);
	$: searching = state.search.trim().length > 0;
	$: selectedLaunchpadId = state.selectedLaunchpadId;
	$: compare = state.compare;
	$: if (selectedLaunchpadId && expanded[selectedLaunchpadId] === undefined) {
		expanded = { ...expanded, [selectedLaunchpadId]: true };
	}

	export function startCreate() {
		creating = true;
		newName = "";
		queueMicrotask(() => newNameInput?.focus());
	}
	async function finishCreate() {
		const name = newName.trim();
		if (!creating) return;
		creating = false;
		newName = "";
		if (name) await store.createLaunchpad({ name });
	}

	function reveal(node, active) {
		const run = (on) => on && node.scrollIntoView({ block: "nearest" });
		run(active);
		return { update: run };
	}
	const showMore = (list) =>
		(shownByList = { ...shownByList, [list]: (shownByList[list] ?? WINDOW) + STEP });
	const showAll = (list, total) => (shownByList = { ...shownByList, [list]: total });
	const rowKey = (row) =>
		row.kind === "entry" ? row.entry.ID : row.kind === "group" ? row.id : `more:${row.list}`;

	// Floating "Latest in …": measured after every render and on scroll.
	// Synchronous on purpose: scroll events already arrive once per frame,
	// and requestAnimationFrame never fires while the window is hidden.
	let scroller;
	let jump = null;
	function updateJump() {
		if (!scroller) return;
		const box = scroller.getBoundingClientRect();
		// Every row except open (sticky) launchpad headers; rows outside a
		// list carry no data-list.
		const rows = [...scroller.querySelectorAll("[data-tree-row]")].map((node) => {
			const rect = node.getBoundingClientRect();
			return {
				list: node.dataset.list ?? null,
				label: node.dataset.label,
				last: node.dataset.last === "true",
				top: rect.top,
				bottom: rect.bottom,
			};
		});
		const next = jumpTarget(rows, { top: box.top, bottom: box.bottom });
		// Only assign on change; afterUpdate would otherwise loop.
		if (next?.list !== jump?.list || next?.label !== jump?.label) jump = next;
	}
	afterUpdate(updateJump);
	export function jumpToLatest() {
		if (!jump) return;
		const last = scroller.querySelector(`[data-list="${CSS.escape(jump.list)}"][data-last="true"]`);
		last?.scrollIntoView({ block: "end", behavior: "smooth" });
	}
</script>

<div class="flex h-full min-h-0 flex-col">
	<header class="space-y-2 border-b border-surface-500/30 p-3">
		<div class="flex items-center justify-between">
			<h2 class="font-bold">
				Launchpads <span class="text-xs font-normal opacity-50">{state.launchpads.length}</span>
			</h2>
			<button class="btn btn-sm {primary} px-2" aria-label="New launchpad" title="New launchpad" on:click={startCreate}>
				<Plus size={16} />
			</button>
		</div>
		<div class="input-group input-group-divider grid-cols-[auto_1fr]">
			<div class="input-group-shim"><Search size={14} /></div>
			<input
				bind:this={searchInput}
				type="search"
				class="text-sm"
				placeholder="Search launchpads and entries…"
				aria-label="Search launchpads"
				value={state.search}
				on:input={(e) => store.setSearch(e.currentTarget.value)}
				on:keydown={(e) => e.key === "Escape" && store.setSearch("")}
			/>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-sm font-bold">Group by status</span>
			<SlideToggle name="Group by status" size="sm" bind:checked={groupByStatus} />
		</div>
		{#if creating}
			<input
				bind:this={newNameInput}
				class="input h-8 text-sm"
				placeholder="New launchpad name, Enter to create"
				aria-label="New launchpad name"
				bind:value={newName}
				on:keydown={(e) => {
					if (e.key === "Enter") finishCreate();
					if (e.key === "Escape") creating = false;
				}}
				on:blur={finishCreate}
			/>
		{/if}
	</header>

	<div class="relative min-h-0 flex-1">
		<div class="lp-scroll h-full overflow-y-auto pb-12" bind:this={scroller} on:scroll={updateJump}>
			{#if results.length === 0}
				<p class="p-4 text-center text-sm opacity-60">
					{searching ? "No matching launchpads or entries" : "No launchpads yet"}
				</p>
			{/if}
			{#each results as { launchpad, entries, matchedEntries } (launchpad.ID)}
				{@const isSelected = launchpad.ID === selectedLaunchpadId}
				{@const open = searching || expanded[launchpad.ID]}
				{@const unseen = state.unseenByLaunchpad[launchpad.ID] || 0}
				{@const summary = launchpadSummary(state.entriesByLaunchpad[launchpad.ID])}
				{@const selectedEntryId = state.selectedEntryByLaunchpad[launchpad.ID]}
				{@const rows = open
					? entryRows({ launchpad, entries, matchedEntries, groupByStatus, shownByList, openGroups, selectedEntryId })
					: []}
				<div data-launchpad={launchpad.ID}>
					<div
						data-tree-row={open ? undefined : ""}
						class="lp-row flex items-center gap-1.5 border-l-4 pr-3 text-sm {open ? 'sticky top-0 z-10' : ''} {isSelected
							? 'border-primary-500 bg-surface-200 dark:bg-surface-700'
							: 'border-transparent bg-surface-50 hover:bg-surface-100 dark:bg-surface-900 dark:hover:bg-surface-800'}"
					>
						<button
							class="py-1.5 pl-1.5 opacity-60 hover:opacity-100"
							aria-label={`${open ? "Collapse" : "Expand"} ${launchpad.Name}`}
							aria-expanded={!!open}
							on:click={() => (expanded = { ...expanded, [launchpad.ID]: !open })}
						>
							{#if open}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
						</button>
						<button
							class="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
							aria-current={isSelected ? "true" : undefined}
							on:click={() => pickLaunchpad(launchpad.ID)}
						>
							{#if open}
								<FolderOpen size={14} class="flex-none text-primary-500" />
							{:else}
								<Folder size={14} class="flex-none opacity-60" />
							{/if}
							<span class="truncate {isSelected ? 'font-bold' : ''}" title={launchpad.Description || launchpad.Name}
								>{launchpad.Name}</span
							>
							{#if isDraftDirty(state, launchpad.ID)}
								<span class="h-1.5 w-1.5 flex-none rounded-full bg-warning-500" title="Unsaved draft"></span>
							{/if}
							{#if state.pendingLaunchByLaunchpad[launchpad.ID]}
								<span class="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-primary-500" title="Launching"></span>
							{/if}
						</button>
						{#if unseen}
							<span class="badge {primary} px-1.5 py-0 text-[10px]" title="{unseen} new {unseen === 1 ? 'entry' : 'entries'}"
								>+{unseen}</span
							>
						{/if}
						<span class="flex-none text-[10px] opacity-50" title="Entries">{summary.count || ""}</span>
						{#if summary.lastStatus !== null}
							<span
								class="w-7 flex-none text-right font-mono text-[10px] {statusClass(summary.lastStatus)}"
								title="Last status">{summary.lastStatus || "…"}</span
							>
						{/if}
					</div>

					{#if open}
						{#if state.entriesByLaunchpad[launchpad.ID] === undefined}
							<p data-tree-row class="py-1 pl-10 text-xs opacity-50">Loading…</p>
						{:else if entries.length === 0}
							<p data-tree-row class="py-1 pl-10 text-xs opacity-50">Empty launchpad</p>
						{/if}
						{#each rows as row (rowKey(row))}
							{#if row.kind === "more"}
								<!-- Same columns as an entry row: ⋯ under the numbers, text under the path. -->
								<div
									data-tree-row
									data-list={row.list}
									class="lp-more relative flex items-center gap-2 border-y border-dashed border-surface-500/30 py-[3px] pr-3 text-[11px] {row.depth === 2
										? 'pl-14'
										: 'pl-10'}"
								>
									<span class="absolute bottom-0 left-[1.15rem] top-0 border-l border-surface-500/30"></span>
									{#if row.depth === 2}<span class="absolute bottom-0 left-[2.4rem] top-0 border-l border-surface-500/30"></span>{/if}
									<span class="w-9 flex-none text-right font-mono opacity-50">⋯</span>
									<span class="min-w-0 flex-1 truncate opacity-60"
										>{row.hidden} earlier {row.hidden === 1 ? "entry" : "entries"}</span
									>
									<button class="flex-none text-primary-500 hover:underline" on:click={() => showMore(row.list)}>
										Show {Math.min(STEP, row.hidden)} more
									</button>
									{#if row.hidden > STEP}
										<button class="flex-none text-primary-500 hover:underline" on:click={() => showAll(row.list, row.total)}
											>Show all</button
										>
									{/if}
								</div>
							{:else if row.kind === "group"}
								<button
									data-tree-row
									data-list={row.open ? row.id : undefined}
									class="lp-group relative flex w-full items-center gap-1.5 py-1 pl-8 pr-3 text-left text-xs hover:bg-surface-100 dark:hover:bg-surface-800"
									aria-expanded={row.open}
									on:click={() => (openGroups = { ...openGroups, [row.id]: !row.open })}
								>
									<span class="absolute bottom-0 left-[1.15rem] top-0 border-l border-surface-500/30"></span>
									{#if row.open}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}
									{#if row.open}<FolderOpen size={12} class="opacity-60" />{:else}<Folder size={12} class="opacity-60" />{/if}
									<span class="font-mono {row.key === 'pending' ? 'opacity-50' : statusClass(Number(row.key))}">{row.key}</span>
									<span class="ml-auto opacity-50">{row.count}</span>
								</button>
							{:else}
								{@const entry = row.entry}
								{@const inCompare = compare?.launchpadId === launchpad.ID}
								{@const active = isSelected && selectedEntryId === entry.ID && !inCompare}
								{@const side = inCompare ? compareSideOf(compare, entry.ID) : null}
								<button
									class="lp-entry group relative flex w-full items-center gap-2 py-[3px] pr-3 text-left font-mono text-[11px] {row.depth ===
									2
										? 'pl-14'
										: 'pl-10'} {active
										? 'bg-primary-500/20'
										: inCompare && compare.picking
											? 'hover:bg-primary-500/15'
											: 'hover:bg-surface-100 dark:hover:bg-surface-800'}"
									data-compare={side ? COMPARE_SIDES[side].label : undefined}
									title="#{row.index + 1} · {entry.Method} {entry.Host}{entry.Path} · {shortTime(entry.RequestedAt)}"
									aria-current={active ? "true" : undefined}
									data-entry={entry.ID}
									data-tree-row
									data-list={row.list ?? undefined}
									data-last={row.last ? "true" : undefined}
									data-label={row.label}
									use:reveal={active}
									on:click={() => pickEntry(launchpad.ID, entry.ID)}
								>
									<span class="absolute bottom-0 left-[1.15rem] top-0 border-l border-surface-500/30"></span>
									{#if row.depth === 2}<span class="absolute bottom-0 left-[2.4rem] top-0 border-l border-surface-500/30"></span>{/if}
									<span class="flex w-9 flex-none items-center justify-end gap-1 opacity-60">
										{#if row.index === 0}<OriginIcon size={12} class="text-primary-500" />{/if}
										{row.index + 1}
									</span>
									<span class="w-11 flex-none opacity-60">{entry.Method}</span>
									<span class="min-w-0 flex-1 truncate">{entry.Path}</span>
									{#if side}
										<span class="{side === 'left' ? 'variant-filled-tertiary' : primary} flex-none px-1.5 text-[10px] font-bold"
											>{COMPARE_SIDES[side].label}</span
										>
									{/if}
									{#if inCompare && compare.picking && !side}
										<span class="hidden flex-none text-[10px] text-primary-500 group-hover:inline">
											as {COMPARE_SIDES[compare.picking].label}
										</span>
									{/if}
									<span class="w-7 flex-none text-right {statusClass(entry.StatusCode)}">{entry.StatusCode || "…"}</span>
									<span class="w-9 flex-none text-right opacity-50">{entry.Length || ""}</span>
								</button>
							{/if}
						{/each}
					{/if}
				</div>
			{/each}
		</div>
		{#if jump}
			<!-- Opaque backing: the light-mode ghost variant is translucent. -->
			<div class="absolute bottom-3 left-1/2 z-20 max-w-[90%] -translate-x-1/2 bg-surface-50 shadow-lg dark:bg-surface-900">
				<button class="btn btn-sm {primary} w-full" title="Jump to the latest entry in {jump.label}" on:click={jumpToLatest}>
					<ArrowDown size={14} />
					<span class="truncate">Latest in {jump.label}</span>
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Thin, theme-coloured scrollbars for the tree. */
	:global(.lp-scroll) {
		scrollbar-width: thin;
		scrollbar-color: rgb(var(--color-surface-500) / 0.35) transparent;
	}
	:global(.lp-scroll::-webkit-scrollbar) {
		width: 8px;
		height: 8px;
	}
	:global(.lp-scroll::-webkit-scrollbar-thumb) {
		background: rgb(var(--color-surface-500) / 0.35);
		border-radius: 4px;
	}
	:global(.lp-scroll::-webkit-scrollbar-track) {
		background: transparent;
	}
</style>
