<script>
	// Compare mode for the open launchpad: the picking banner, the A/B chip
	// strip with swap and length summary, and the side-by-side line diff.
	// Rules live in compare.js and lineDiff.js; this only renders them.
	import { modeCurrent } from "@skeletonlabs/skeleton";
	import { ArrowLeftRight, GitCompare } from "lucide-svelte";
	import { COMPARE_SIDES, compareView, lengthSummary } from "./compare.js";
	import { primaryVariant, statusClass } from "./format.js";
	import { foldRows, lineDiff } from "./lineDiff.js";

	export let store;

	let tab = "response";
	/** Flips the diff between the Request and Response tabs. */
	export function toggleTab() {
		tab = tab === "response" ? "request" : "response";
	}

	$: state = $store;
	$: view = compareView(state);
	// Each compare opens on the Response tab.
	$: if (!view) tab = "response";
	$: primary = primaryVariant($modeCurrent);
	$: leftDetails = view?.left && state.detailsById[view.left.entry.ID];
	$: rightDetails = view?.right && state.detailsById[view.right.entry.ID];
	$: part = tab === "response" ? "Response" : "Request";
	$: diff = view?.comparing
		? lineDiff(leftDetails?.[part]?.Raw, rightDetails?.[part]?.Raw)
		: { rows: [], approximate: false };
	$: lengths = lengthSummary(leftDetails, rightDetails, tab);
	$: note =
		!leftDetails || !rightDetails
			? "Loading…"
			: tab === "response" && (!leftDetails.Response || !rightDetails.Response)
				? "One side has no response yet."
				: "";

	// Opened folds reset whenever the diff itself changes.
	let expanded = new Set();
	$: diff, (expanded = new Set());
	$: items = foldRows(diff.rows, expanded);
	$: changes = diff.rows.filter((row) => row.kind !== "same").length;
	const expand = (start) => (expanded = new Set([...expanded, start]));

	const cell = {
		same: ["", ""],
		changed: ["bg-error-500/15", "bg-success-500/15"],
		removed: ["bg-error-500/20", "bg-surface-500/10"],
		added: ["bg-surface-500/10", "bg-success-500/20"],
	};
	const chips = (v) => [
		["left", COMPARE_SIDES.left.label, v.left, "variant-filled-tertiary"],
		["right", COMPARE_SIDES.right.label, v.right, primary],
	];
</script>

{#if view}
	{#if view.picking}
		<div
			class="lp-compare-banner flex flex-wrap items-center gap-3 border-b border-l-4 border-surface-500/30 border-l-primary-500 bg-surface-100 px-3 py-2 text-xs dark:bg-surface-800"
		>
			<GitCompare size={14} />
			{#if view.picking === "right" && !view.right}
				<span>
					Comparing <span class="variant-filled-tertiary px-1.5 font-mono">A #{view.left?.number}</span>
					with… <b>click any entry in the sidebar</b>
				</span>
				{#if view.quickPicks.length}<span class="opacity-60">or</span>{/if}
				{#each view.quickPicks as pick}
					<button class="btn btn-sm {primary} py-0.5" on:click={() => store.setCompareSide("right", pick.id)}
						>{pick.label}</button
					>
				{/each}
			{:else}
				<span><b>Click an entry in the sidebar</b> to use as the new {COMPARE_SIDES[view.picking].label}.</span>
			{/if}
			<span class="ml-auto opacity-60">Esc to cancel</span>
		</div>
	{/if}

	{#if view.comparing}
		<div class="lp-compare-strip flex flex-wrap items-center gap-2 border-b border-surface-500/30 bg-surface-100 px-3 py-2 text-xs dark:bg-surface-800">
			{#each chips(view) as [side, letter, item, chipClass], i}
				{#if i === 1}
					<button
						class="btn btn-sm variant-soft self-stretch px-2"
						title="Swap A and B"
						aria-label="Swap A and B"
						on:click={store.swapCompare}
					>
						<ArrowLeftRight size={14} />
					</button>
				{/if}
				<button
					class="lp-chip flex min-w-0 items-center gap-2 border px-2 py-1 font-mono transition-colors {view.picking === side
						? 'border-primary-500 bg-primary-500/10'
						: 'border-surface-500/30 hover:border-primary-500'}"
					title="Click, then pick another entry for {letter}"
					aria-pressed={view.picking === side}
					data-side={side}
					on:click={() => store.pickCompareSide(view.picking === side ? null : side)}
				>
					<span class="{chipClass} px-1.5 text-[11px] font-bold">{letter}</span>
					<span>#{item.number}</span>
					<span class="truncate opacity-60">{item.entry.Method} {item.entry.Path}</span>
					<span class={statusClass(item.entry.StatusCode)}>{item.entry.StatusCode || "…"}</span>
				</button>
			{/each}
			<span class="lp-length ml-2 whitespace-nowrap">
				Length {lengths.left ?? "…"} → {lengths.right ?? "…"}
				{#if lengths.delta !== null}
					<span class={lengths.delta === 0 ? "opacity-50" : lengths.delta > 0 ? "text-success-500" : "text-error-500"}>
						({lengths.delta > 0 ? "+" : ""}{lengths.delta})
					</span>
				{/if}
			</span>
			<span class="whitespace-nowrap opacity-60">· {changes} changed {changes === 1 ? "line" : "lines"}</span>
			<div class="ml-auto flex">
				{#each ["request", "response"] as name}
					<button
						class="btn btn-sm capitalize {tab === name ? primary : 'variant-soft'}"
						aria-pressed={tab === name}
						on:click={() => (tab = name)}>{name}</button
					>
				{/each}
			</div>
		</div>
		{#if diff.approximate}
			<p class="border-b border-surface-500/30 bg-warning-500/10 px-3 py-1 text-xs">
				These bodies differ too much to align line by line; the differing middle is shown as one block.
			</p>
		{/if}
		<div class="lp-diff lp-scroll min-h-0 flex-1 overflow-auto font-mono text-xs">
			{#if note}<p class="p-4 font-sans text-sm opacity-60">{note}</p>{/if}
			<table class="w-full table-fixed border-collapse">
				<colgroup>
					<col class="w-10" />
					<col />
					<col class="w-10" />
					<col />
				</colgroup>
				{#each items as item}
					{#if item.fold}
						<tr>
							<td colspan="4" class="p-0">
								<button
									class="lp-fold w-full bg-surface-500/10 px-2 py-0.5 text-left font-sans opacity-70 hover:bg-primary-500/10 hover:opacity-100"
									on:click={() => expand(item.start)}
								>
									⋯ {item.count} unchanged lines
								</button>
							</td>
						</tr>
					{:else}
						{@const row = item.row}
						<tr data-kind={row.kind}>
							<td class="select-none px-1 text-right align-top opacity-40 {cell[row.kind][0]}">{row.leftNo ?? ""}</td>
							<td
								class="whitespace-pre-wrap break-all border-r border-surface-500/30 px-2 align-top {cell[row.kind][0]}"
								>{row.left ?? ""}</td
							>
							<td class="select-none px-1 text-right align-top opacity-40 {cell[row.kind][1]}">{row.rightNo ?? ""}</td>
							<td class="whitespace-pre-wrap break-all px-2 align-top {cell[row.kind][1]}">{row.right ?? ""}</td>
						</tr>
					{/if}
				{/each}
			</table>
		</div>
	{/if}
{/if}
