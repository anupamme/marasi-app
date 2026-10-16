<script>
	// The Ledger's sitemap dock, in the Launchpad tree's style: one scroll
	// container, open origins sticky at the top, each level showing its
	// busiest children with "Show more". Choosing a node narrows the query;
	// the eye-off button leaves it out. Rows come from the sitemap store
	// (sitemapRows); this component only renders.
	import { modeCurrent } from "@skeletonlabs/skeleton";
	import { createEventDispatcher } from "svelte";
	import {
		ChevronDown,
		ChevronRight,
		ChevronsDownUp,
		CircleAlert,
		EyeOff,
		FileText,
		Folder,
		FolderOpen,
		Globe,
		LoaderCircle,
		Search,
		X,
	} from "lucide-svelte";
	import { isPlaceholder, sitemapExcludeTerm, sitemapTerm } from "./sitemap.js";
	import { primaryVariant } from "../launchpad/format.js";
	import { hostCountLabel, sitemapRows, sitemapScope, STEP } from "../../stores/sitemapStore";

	export let store;
	/** The node the query narrows to, or null. */
	export let activeNode = null;
	/** The find box, focused by the dock strip's search button. */
	export let findInput = null;

	const dispatch = createEventDispatcher();
	let find = "";

	$: primary = primaryVariant($modeCurrent);
	$: state = $store;
	$: scope = sitemapScope(state);
	$: querying = !!state.context.query;
	$: rows = sitemapRows(state, find);
	$: hosts = hostCountLabel(state);
	$: roots = state.levels[""];

	const pad = (depth) => 8 + depth * 14;
	const count = (n) => Number(n).toLocaleString();

	function onFindKeydown(event) {
		event.stopPropagation();
		if (event.key === "Escape") find = "";
	}
</script>

<div class="ledger-sitemap flex h-full min-h-0 flex-col text-sm">
	<header class="space-y-2 border-b border-surface-500/30 p-3">
		<div class="flex items-center justify-between gap-2 pr-5">
			<h2 class="font-bold">
				Sitemap {#if hosts}<span class="ledger-sitemap-hosts text-xs font-normal opacity-50">{hosts}</span>{/if}
			</h2>
			{#if !state.complete}
				<span
					class="ledger-sitemap-building flex items-center gap-1 text-[11px] text-warning-800 dark:text-warning-400"
					title="Marasi is still adding older pairs to the sitemap, so some counts are low"
				>
					<LoaderCircle size={11} class="animate-spin" /> Sitemap still building
				</span>
			{/if}
		</div>
		<div class="flex gap-1">
			<div class="input-group input-group-divider h-8 flex-1 grid-cols-[auto_1fr_auto]">
				<div class="input-group-shim px-2"><Search size={13} /></div>
				<input
					bind:this={findInput}
					class="ledger-sitemap-find text-xs"
					placeholder="Find host or path"
					aria-label="Find a host or path in the sitemap"
					bind:value={find}
					on:keydown={onFindKeydown}
				/>
				{#if find}
					<button class="px-2 opacity-60 hover:opacity-100" aria-label="Clear the find box" on:click={() => (find = "")}
						><X size={12} /></button
					>
				{:else}<span></span>{/if}
			</div>
			<button
				class="ledger-sitemap-collapse-all btn btn-sm variant-soft px-2"
				title="Collapse all"
				aria-label="Collapse all"
				on:click={() => store.collapseAll()}
			>
				<ChevronsDownUp size={14} />
			</button>
		</div>
		<div
			class="ledger-sitemap-scope flex text-[11px]"
			role="group"
			aria-label="Sitemap counts"
			title={querying ? "" : "Run a query to count only matching traffic"}
		>
			{#each [["all", "All", "Count all traffic"], ["matching", "Matching", "Count only traffic matching the query"]] as [key, label, hint]}
				<button
					class="flex-1 px-2 py-1 {scope === key
						? primary
						: 'bg-surface-200 hover:bg-surface-300 dark:bg-surface-700 dark:hover:bg-surface-600'} {key === 'matching' && !querying
						? 'cursor-not-allowed opacity-40'
						: ''}"
					title={querying || key === "all" ? hint : ""}
					aria-pressed={scope === key}
					disabled={key === "matching" && !querying}
					on:click={() => store.setScope(key)}>{label}</button
				>
			{/each}
		</div>
	</header>

	<div class="lp-scroll no-select min-h-0 flex-1 overflow-y-auto pb-10 font-mono text-[11px]">
		{#each rows as row}
			{#if row.kind === "more"}
				<div
					class="ledger-sitemap-more flex items-center gap-2 border-y border-dashed border-surface-500/30 py-[3px] pr-3 font-sans"
					style="padding-left:{pad(row.depth) + 14}px"
				>
					<span class="opacity-60">{count(row.hidden)}{row.partial ? "+" : ""} more</span>
					<button class="text-primary-500 hover:underline" on:click={() => store.showMore(row.parent)}
						>Show {row.hidden > 0 ? Math.min(STEP, row.hidden) : STEP} more</button
					>
				</div>
			{:else if row.kind === "loading"}
				<p class="py-[3px] font-sans opacity-50" style="padding-left:{pad(row.depth) + 14}px">Loading…</p>
			{:else if row.kind === "failed"}
				<p class="flex items-center gap-1 py-[3px] font-sans text-error-500" style="padding-left:{pad(row.depth) + 14}px">
					<CircleAlert size={11} /> Couldn't read this level.
				</p>
			{:else}
				{@const n = row.node}
				{@const origin = row.depth === 0}
				{@const active = n.Name === activeNode}
				<div
					data-sitemap-node={n.Name}
					class="ledger-sitemap-node group flex items-center gap-1 border-l-4 pr-2 {origin
						? 'py-1 font-sans text-xs'
						: 'py-[2px]'} {origin && row.open ? 'sticky top-0 z-10' : ''} {active
						? 'border-primary-500 bg-surface-200 dark:bg-surface-700'
						: 'border-transparent ' +
							(origin ? 'bg-surface-50 dark:bg-surface-900 ' : '') +
							'hover:bg-surface-100 dark:hover:bg-surface-800'} {row.dimmed ? 'opacity-40' : ''}"
					style="padding-left:{pad(row.depth) - 4}px"
				>
					{#if n.HasChildren}
						<button
							class="opacity-60 hover:opacity-100"
							aria-label="{row.open ? 'Collapse' : 'Expand'} {n.Name}"
							aria-expanded={row.open}
							on:click={() => store.toggle(n.Name)}
						>
							{#if row.open}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}
						</button>
					{:else}<span class="w-3 flex-none"></span>{/if}
					{#if origin}
						<Globe size={13} class="flex-none text-primary-500" />
					{:else if n.HasChildren}
						{#if row.open}<FolderOpen size={12} class="flex-none opacity-60" />{:else}<Folder
								size={12}
								class="flex-none opacity-50"
							/>{/if}
					{:else}<FileText size={12} class="flex-none opacity-40" />{/if}
					<button
						class="min-w-0 flex-1 truncate text-left {origin ? 'font-semibold' : ''} {isPlaceholder(n.Segment)
							? 'italic text-tertiary-600 dark:text-tertiary-400'
							: ''} {active ? 'font-bold' : ''}"
						title={active ? `Remove ${sitemapTerm(n.Name)} from the query` : `Narrow the query to ${sitemapTerm(n.Name)}`}
						aria-current={active ? "true" : undefined}
						on:click={() => dispatch("choose", n.Name)}
					>
						{origin ? n.Segment : "/" + n.Segment}
					</button>
					<button
						class="hidden flex-none opacity-50 hover:opacity-100 group-hover:block"
						title="Leave out of the query: {sitemapExcludeTerm(n.Name)}"
						aria-label="Leave {n.Name} out of the query"
						on:click={() => dispatch("exclude", n.Name)}
					>
						<EyeOff size={11} />
					</button>
					{#if n.Errors}
						<span class="flex-none text-[10px] text-error-500" title="Server errors (5xx)">{count(n.Errors)}</span>
					{/if}
					<span
						class="flex-none text-right text-[10px] tabular-nums opacity-60"
						title={row.matching !== null ? "Matching the query / all pairs" : "Pairs"}
						>{#if row.matching !== null}<b>{count(row.matching)}</b>/{/if}{count(n.Pairs)}</span
					>
				</div>
			{/if}
		{/each}
		{#if roots?.failed && rows.length === 0}
			<p class="flex items-center justify-center gap-1 p-4 font-sans text-xs text-error-500">
				<CircleAlert size={12} /> Couldn't read the sitemap.
				<button class="underline" on:click={() => store.reload()}>Try again</button>
			</p>
		{:else if roots && !roots.loading && rows.length === 0}
			<p class="p-4 text-center font-sans text-xs opacity-60">
				{#if find}Nothing loaded matches "{find}".{:else if scope === "matching"}No pairs match the query.{:else}No traffic yet.{/if}
			</p>
		{:else if !roots || (roots.loading && rows.length === 0)}
			<p class="p-4 text-center font-sans text-xs opacity-50">Loading…</p>
		{/if}
	</div>
</div>
