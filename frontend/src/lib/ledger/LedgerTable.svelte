<script>
	// The Ledger table: one windowed list with fixed-height rows, so only the
	// rows in view render however many the table holds. A highlighted row
	// has a 3px stripe in its colour and a light tint; the stripe stays when
	// the row is selected. Selected rows are tinted; the focused one, which
	// the drawer shows, is also outlined.
	//
	// `rows` is the store's window of loaded pages. The table reports the
	// rows in view (`viewport`) so pages load and drop around them, and when
	// rows are added or dropped above, it keeps the top row in view where it
	// was, so nothing moves under the researcher.
	import { afterUpdate, createEventDispatcher } from "svelte";
	import RowBadges from "./RowBadges.svelte";
	import {
		HEADER_HEIGHT,
		LEDGER_COLUMNS,
		ROW_HEIGHT,
		formatSize,
		keepRowInPlace,
		rowHighlight,
		rowTemplate,
		scrollToReveal,
		shortType,
		sortMark,
		visibleRange,
	} from "./table.js";
	import { sameID } from "../../stores/createLedgerStore.js";
	import { shortTime, statusClass } from "../launchpad/format.js";

	/** The rows, top to bottom. */
	export let rows = [];
	/** The focused pair's ID, or null. */
	export let focusId = null;
	/** The selected pairs' IDs, as strings. */
	export let selectedIds = new Set();
	/** The highlight palette (stores/highlightsStore.js). */
	export let palette = [];
	/** The first row's number for the # column, or null when unknown. */
	export let firstNumber = null;
	/** The sort: { field, desc }. */
	export let sort = null;
	/**
	 * True when rows added at the top should show while the table is
	 * scrolled to the top (the newest-first live view).
	 */
	export let pinTop = false;
	/** Changes when fresh results load from the top; the table scrolls there. */
	export let resetKey = 0;

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

	// The top row in view and how far it is scrolled into, so it can keep
	// its place when the rows change.
	let anchor = { id: null, offset: 0 };
	let laidOut = rows;
	let laidOutReset = resetKey;
	let reported = "";

	// Records the top row in view and reports the rows in view when they
	// changed.
	function noteScroll() {
		const top = Math.floor(scrollTop / ROW_HEIGHT);
		anchor = { id: rows[top]?.ID ?? null, offset: scrollTop - top * ROW_HEIGHT };
		const visible = Math.max(1, Math.ceil(rowsHeight / ROW_HEIGHT));
		const lastRow = Math.max(rows.length - 1, 0);
		const view = {
			first: Math.min(top, lastRow),
			last: Math.min(top + visible, lastRow),
			atTop: scrollTop <= 0,
		};
		const key = `${view.first}:${view.last}:${view.atTop}:${rows.length}`;
		if (key === reported) return;
		reported = key;
		dispatch("viewport", view);
	}

	afterUpdate(() => {
		if (!viewport) return;
		if (resetKey !== laidOutReset) {
			// Fresh results: back to the top.
			laidOutReset = resetKey;
			laidOut = rows;
			viewport.scrollTop = 0;
		} else if (rows !== laidOut) {
			// The same results with rows added or dropped around the view.
			laidOut = rows;
			if (!(pinTop && viewport.scrollTop <= 0)) {
				const next = keepRowInPlace({ anchorID: anchor.id, offset: anchor.offset, rows, rowHeight: ROW_HEIGHT });
				if (next != null && next !== viewport.scrollTop) viewport.scrollTop = next;
			}
		}
		scrollTop = viewport.scrollTop;
		noteScroll();
	});

	function onScroll() {
		scrollTop = viewport.scrollTop;
		noteScroll();
	}

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
	/** Scrolls to the first row. */
	export function scrollToTop() {
		if (!viewport) return;
		viewport.scrollTop = 0;
		onScroll();
	}

	// ↑/↓ move the selection (⇧ extends it), ⌘A selects every row, and the
	// menu key or ⇧F10 opens the row menu. Esc belongs to the page.
	function onKeydown(event) {
		const primary = event.metaKey || event.ctrlKey;
		if (primary && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a") {
			event.preventDefault();
			dispatch("selectall");
			return;
		}
		if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
			event.preventDefault();
			dispatch("menukey");
			return;
		}
		if (primary || event.altKey) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			dispatch("step", { step: event.key === "ArrowDown" ? 1 : -1, extend: event.shiftKey });
		}
	}

	// Pressing a row selects it: plain starts a drag sweep, ⌘/Ctrl toggles
	// and ⇧ selects a range. Right-clicks belong to the menu.
	let sweeping = false;
	function onRowPointerDown(event, id) {
		if (event.button !== 0) return;
		const toggle = event.metaKey || event.ctrlKey;
		if (toggle || event.shiftKey) {
			dispatch("click", { id, toggle, range: event.shiftKey });
			return;
		}
		sweeping = true;
		dispatch("sweepstart", id);
	}
	function onRowPointerEnter(id) {
		if (sweeping) dispatch("sweep", id);
	}
	function endSweep() {
		if (!sweeping) return;
		sweeping = false;
		dispatch("sweepend");
	}

	/** The on-screen box of the row with this ID, or null when it isn't rendered. */
	export function rowRect(id) {
		const selector = `[data-row="${CSS.escape(String(id))}"]`;
		return viewport?.querySelector(selector)?.getBoundingClientRect() ?? null;
	}
</script>

<svelte:window on:pointerup={endSweep} on:blur={endSweep} />

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div
	bind:this={viewport}
	bind:clientHeight={height}
	on:scroll={onScroll}
	on:keydown={onKeydown}
	tabindex="0"
	class="ledger-table no-select relative h-full overflow-auto font-mono focus:outline-none"
	role="grid"
	aria-rowcount={rows.length}
	aria-multiselectable="true"
>
	<div
		class="lg-row sticky top-0 z-10 border-b border-primary-500 bg-surface-100 font-sans text-[11px] font-semibold dark:bg-surface-800"
		style="grid-template-columns: {template}; height: {HEADER_HEIGHT}px"
		role="row"
	>
		{#each LEDGER_COLUMNS as column (column.key)}
			{@const mark = sortMark(sort, column)}
			{#if column.sort}
				<button
					type="button"
					class="ledger-sort h-full hover:bg-surface-200-700-token {column.align === 'right'
						? 'text-right'
						: 'text-left'} {mark ? 'text-primary-500' : ''}"
					role="columnheader"
					aria-sort={mark ? (sort.desc ? "descending" : "ascending") : "none"}
					title="Sort by {column.label === '#' ? 'number' : column.label.toLowerCase()}"
					data-sort={column.sort}
					on:click={() => dispatch("sort", column.sort)}>{column.label}{mark ? ` ${mark}` : ""}</button
				>
			{:else}
				<span role="columnheader">{column.label}</span>
			{/if}
		{/each}
	</div>
	<div style="height: {rows.length * ROW_HEIGHT}px; position: relative">
		<div style="position: absolute; left: 0; right: 0; top: {range.start * ROW_HEIGHT}px">
			{#each shown as row, i (String(row.ID))}
				{@const selected = selectedIds.has(String(row.ID))}
				{@const focused = sameID(row.ID, focusId)}
				{@const color = rowHighlight(row, palette)}
				<!-- svelte-ignore a11y-click-events-have-key-events a11y-interactive-supports-focus -->
				<div
					class="lg-row ledger-row border-b border-surface-300/50 dark:border-surface-700/60 {selected
						? 'bg-primary-500/25'
						: 'hover:bg-surface-200/70 dark:hover:bg-surface-700/60'} {focused
						? 'outline outline-1 -outline-offset-1 outline-primary-500'
						: ''}"
					style="grid-template-columns: {template}; height: {ROW_HEIGHT}px;{color
						? ` box-shadow: inset 3px 0 0 ${color};`
						: ''}{color && !selected ? ` background-color: ${color}22;` : ''}"
					data-row={String(row.ID)}
					role="row"
					aria-selected={selected}
					on:pointerdown={(event) => onRowPointerDown(event, row.ID)}
					on:pointerenter={() => onRowPointerEnter(row.ID)}
					on:contextmenu|preventDefault={(event) => dispatch("menu", { id: row.ID, event })}
				>
					<span class="text-right tabular-nums opacity-60"
						>{firstNumber == null ? "" : firstNumber + range.start + i}</span
					>
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
