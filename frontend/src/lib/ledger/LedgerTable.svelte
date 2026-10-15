<script>
	// The Ledger table: one windowed list with fixed-height rows, so only the
	// rows in view render however many the table holds. A highlighted row
	// has a 3px stripe in its colour and a light tint; the stripe stays when
	// the row is selected.
	import { createEventDispatcher } from "svelte";
	import RowBadges from "./RowBadges.svelte";
	import {
		HEADER_HEIGHT,
		LEDGER_COLUMNS,
		ROW_HEIGHT,
		formatSize,
		rowHighlight,
		rowTemplate,
		scrollToReveal,
		shortType,
		visibleRange,
	} from "./table.js";
	import { sameID } from "../../stores/createLedgerStore.js";
	import { shortTime, statusClass } from "../launchpad/format.js";

	/** The rows, top to bottom. */
	export let rows = [];
	/** The focused pair's ID, or null. */
	export let focusId = null;
	/** The highlight palette (stores/highlightsStore.js). */
	export let palette = [];
	/** A pair's number for the # column. */
	export let numberOf = (row) => "";
	/** Rows from the end at which `nearend` fires. */
	export let nearEndRows = 50;

	const dispatch = createEventDispatcher();
	const template = rowTemplate(LEDGER_COLUMNS);
	const OVERSCAN = 15;
	const METHOD_CLASS = {
		POST: "text-tertiary-500",
		PUT: "text-warning-500",
		PATCH: "text-warning-500",
		DELETE: "text-error-500",
	};

	let viewport;
	let scrollTop = 0;
	let height = 600;

	$: rowsHeight = Math.max(0, height - HEADER_HEIGHT);
	$: range = visibleRange({
		scrollTop,
		height: rowsHeight,
		count: rows.length,
		rowHeight: ROW_HEIGHT,
		overscan: OVERSCAN,
	});
	$: shown = rows.slice(range.start, range.end);
	$: if (rows.length > 0 && range.end >= rows.length - nearEndRows) dispatch("nearend");

	/** Scrolls just enough to show the row with this ID. */
	export function reveal(id) {
		const index = rows.findIndex((row) => sameID(row.ID, id));
		if (!viewport || index < 0) return;
		// Measure now: the bound height lags on the first render.
		const visible = Math.max(0, viewport.clientHeight - HEADER_HEIGHT);
		viewport.scrollTop = scrollToReveal(
			{ scrollTop: viewport.scrollTop, height: visible, rowHeight: ROW_HEIGHT },
			index,
		);
	}
	/** Scrolls a viewport's height down (1) or up (-1). */
	export function page(direction) {
		if (viewport) viewport.scrollTop += direction * Math.max(rowsHeight - ROW_HEIGHT, ROW_HEIGHT);
	}
	export function focus() {
		viewport?.focus();
	}

	function onKeydown(event) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			dispatch("step", event.key === "ArrowDown" ? 1 : -1);
		}
	}
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div
	bind:this={viewport}
	bind:clientHeight={height}
	on:scroll={() => (scrollTop = viewport.scrollTop)}
	on:keydown={onKeydown}
	tabindex="0"
	class="ledger-table no-select relative h-full overflow-auto font-mono focus:outline-none"
	role="grid"
	aria-rowcount={rows.length}
>
	<div
		class="lg-row sticky top-0 z-10 border-b border-primary-500 bg-surface-100 font-sans text-[11px] font-semibold dark:bg-surface-800"
		style="grid-template-columns: {template}; height: {HEADER_HEIGHT}px"
		role="row"
	>
		{#each LEDGER_COLUMNS as column (column.key)}
			<span class={column.align === "right" ? "text-right" : ""} role="columnheader"
				>{column.label}</span
			>
		{/each}
	</div>
	<div style="height: {rows.length * ROW_HEIGHT}px; position: relative">
		<div style="position: absolute; left: 0; right: 0; top: {range.start * ROW_HEIGHT}px">
			{#each shown as row (String(row.ID))}
				{@const selected = sameID(row.ID, focusId)}
				{@const color = rowHighlight(row, palette)}
				<!-- svelte-ignore a11y-click-events-have-key-events a11y-interactive-supports-focus -->
				<div
					class="lg-row ledger-row border-b border-surface-300/50 dark:border-surface-700/60 {selected
						? 'bg-primary-500/25 outline outline-1 -outline-offset-1 outline-primary-500'
						: 'hover:bg-surface-200/70 dark:hover:bg-surface-700/60'}"
					style="grid-template-columns: {template}; height: {ROW_HEIGHT}px;{color
						? ` box-shadow: inset 3px 0 0 ${color};`
						: ''}{color && !selected ? ` background-color: ${color}22;` : ''}"
					data-row={String(row.ID)}
					role="row"
					aria-selected={selected}
					on:click={() => dispatch("select", row.ID)}
					on:contextmenu|preventDefault={(event) => dispatch("menu", { id: row.ID, event })}
				>
					<span class="text-right tabular-nums opacity-60">{numberOf(row)}</span>
					<span class="!overflow-visible !pl-1"><RowBadges {row} /></span>
					<span class="opacity-60">{shortTime(row.RequestedAt)}</span>
					<span class={METHOD_CLASS[row.Method] ?? ""}>{row.Method ?? ""}</span>
					<span title={row.Host}>{row.Host ?? ""}</span>
					<span title={row.Path}>{row.Path ?? ""}</span>
					<span class="text-right {statusClass(row.StatusCode)}">{row.StatusCode || "…"}</span>
					<span class="opacity-60" title={row.ContentType}>{shortType(row.ContentType)}</span>
					<span class="text-right opacity-60">{formatSize(row.Length)}</span>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.ledger-table {
		scrollbar-width: thin;
		scrollbar-color: rgb(var(--color-surface-500) / 0.35) transparent;
	}
	.lg-row {
		display: grid;
		align-items: center;
		font-size: 11px;
		white-space: nowrap;
		min-width: 734px;
	}
	.lg-row > :global(*) {
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 0 6px;
	}
</style>
