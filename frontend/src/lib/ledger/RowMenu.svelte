<script>
	// The Ledger's row context menu. Its header sums up the selection, a
	// type-to-filter box searches every action (submenus included), and the
	// keys work as in a native menu: ↑↓ move, → or ↵ open a submenu, ←
	// goes back, ↵ runs, Esc closes. The items come from rowMenu.js, computed
	// from the selected pairs; choosing one dispatches `action` with the
	// item's action for the page to run. The highlight swatches sit on one
	// row: ←→ move between them there, and hovering one shows its label.
	import { createEventDispatcher, tick } from "svelte";
	import {
		Braces,
		BookCheck,
		Check,
		ChevronRight,
		Copy,
		Eraser,
		EyeOff,
		Filter,
		Highlighter,
		Link,
		ListChecks,
		Minus,
		PanelBottomOpen,
		Pen,
		Plus,
		Radio,
		Search,
		Send,
		ShieldAlert,
		Swords,
		Trash2,
		Unlink,
		X,
	} from "lucide-svelte";
	import { filterMenu, isPartialSelection, isRunnable, isSwatchRow, menuFor, selectionSummary } from "./rowMenu.js";
	import { menuDispatcher } from "../keybindings/app.js";
	import { formatBinding } from "../keybindings/keys.js";
	import { statusClass } from "../launchpad/format.js";
	import { plural } from "./counts.js";
	import { statusText } from "./table.js";

	/** Whether the menu shows. The menu closes itself by setting it false. */
	export let open = false;
	/** Where it opens, in viewport px. */
	export let x = 0;
	export let y = 0;
	/** The selected pairs, in table order. */
	export let pairs = [];
	/** What the menu lists besides the pairs: see menuFor in rowMenu.js. */
	export let context = {};

	const dispatch = createEventDispatcher();

	const ICONS = {
		open: PanelBottomOpen,
		radio: Radio,
		send: Send,
		plus: Plus,
		swords: Swords,
		finding: ShieldAlert,
		testcase: BookCheck,
		pen: Pen,
		copy: Copy,
		filter: Filter,
		select: ListChecks,
		braces: Braces,
		link: Link,
		unlink: Unlink,
		"eye-off": EyeOff,
		highlighter: Highlighter,
		trash: Trash2,
		eraser: Eraser,
	};
	const METHOD_CLASS = {
		POST: "text-tertiary-500",
		PUT: "text-warning-800 dark:text-warning-500",
		PATCH: "text-warning-800 dark:text-warning-500",
		DELETE: "text-error-500",
	};
	const SEVERITY_CLASS = {
		Critical: "bg-red-600 text-white",
		High: "bg-orange-500 text-white",
		Medium: "bg-yellow-500 text-black",
		Low: "bg-blue-500 text-white",
		Informational: "bg-surface-500 text-white",
	};

	let root;
	let subMenu;
	let filterBox;
	let filter = "";
	// The highlighted item in the list, the item whose submenu is open, and
	// the highlighted item in that submenu; -1 or null for none.
	let active = -1;
	let sub = null;
	let subActive = -1;
	// The swatch picked out on the highlight row, by keys or the pointer.
	let swatchActive = 0;
	let position = { left: 0, top: 0 };
	let subPosition = { left: 0, top: 0 };

	$: items = open ? menuFor(pairs, context) : [];
	$: list = filterMenu(items, filter);
	$: filtered = filter.trim() !== "";
	$: summary = open ? selectionSummary(pairs) : null;
	$: subItems = sub != null && Array.isArray(list[sub]?.sub) ? list[sub].sub : [];

	$: if (open) place();
	$: if (!open) reset();
	// A new filter starts at its first match.
	$: onFilter(filter, list);
	function onFilter() {
		active = filtered ? step(list, -1, 1) : -1;
		sub = null;
	}

	function reset() {
		filter = "";
		active = -1;
		sub = null;
		subActive = -1;
		swatchActive = 0;
	}

	// `refocus` is false when the researcher clicked elsewhere, which keeps focus.
	function close(refocus = true) {
		open = false;
		dispatch("close", { refocus });
	}

	// Keeps the menu on screen, flipping left of the pointer when it would
	// run off the right edge.
	async function place() {
		position = { left: x, top: y };
		await tick();
		if (!root) return;
		const rect = root.getBoundingClientRect();
		position = {
			left: Math.max(4, x + rect.width > innerWidth - 4 ? x - rect.width : x),
			top: Math.max(4, Math.min(y, innerHeight - rect.height - 4)),
		};
		filterBox?.focus({ preventScroll: true });
	}

	async function openSub(index) {
		if (sub === index) return;
		sub = index;
		subActive = -1;
		await tick();
		const row = root?.querySelector(`[data-menu-index="${index}"]`);
		if (!row || !subMenu) return;
		const rowRect = row.getBoundingClientRect();
		const menuRect = root.getBoundingClientRect();
		const subRect = subMenu.getBoundingClientRect();
		const fitsRight = menuRect.right + subRect.width < innerWidth - 4;
		subPosition = {
			left: fitsRight ? menuRect.width - 4 : -subRect.width + 4,
			top: Math.max(
				-menuRect.top + 4,
				Math.min(rowRect.top - menuRect.top - 5, innerHeight - menuRect.top - subRect.height - 4),
			),
		};
	}

	function choose(item) {
		if (!isRunnable(item)) return;
		if (isSwatchRow(item)) {
			choose(item.swatches[swatchActive]);
			return;
		}
		if (Array.isArray(item.sub)) {
			openSub(list.indexOf(item));
			return;
		}
		close();
		dispatch("action", item.action);
	}

	// The next runnable item from `from` in direction `d`, wrapping around.
	function step(items, from, d) {
		for (let k = 1; k <= items.length; k++) {
			const i = (((from + d * k) % items.length) + items.length) % items.length;
			if (isRunnable(items[i])) return i;
		}
		return from;
	}

	async function enterSub() {
		await openSub(active);
		subActive = step(subItems, -1, 1);
	}

	function onKeydown(event) {
		if (!open) return;
		const inSub = sub != null && subActive >= 0;
		const handled = () => {
			event.preventDefault();
			event.stopPropagation();
		};
		if (event.key === "Escape") {
			handled();
			if (sub != null) {
				sub = null;
				subActive = -1;
			} else close();
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			handled();
			const d = event.key === "ArrowDown" ? 1 : -1;
			if (inSub) subActive = step(subItems, subActive, d);
			else {
				active = step(list, active, d);
				sub = null;
			}
		} else if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && !inSub && isSwatchRow(list[active])) {
			handled();
			const count = list[active].swatches.length;
			swatchActive = (swatchActive + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
		} else if (event.key === "ArrowRight") {
			if (!inSub && Array.isArray(list[active]?.sub)) {
				handled();
				enterSub();
			}
		} else if (event.key === "ArrowLeft") {
			if (sub != null) {
				handled();
				sub = null;
				subActive = -1;
			}
		} else if (event.key === "Enter") {
			handled();
			if (inSub) choose(subItems[subActive]);
			else if (Array.isArray(list[active]?.sub)) enterSub();
			else choose(list[active]);
		} else if (event.key === "Tab") {
			handled();
		}
	}

	function onPointerDown(event) {
		if (open && root && !root.contains(event.target)) close(false);
	}

	// The item's current shortcut from the keybinding profile, if it has one.
	function shortcut(item, keymap) {
		if (item.kbd) return item.kbd;
		if (!item.actionId) return "";
		const binding = keymap.bindingsFor(item.actionId)[0];
		return binding ? formatBinding(binding, keymap.platform) : "";
	}

	// A ⌘A selection counts every match, not just the loaded pairs. While it
	// holds pairs the table hasn't loaded, the header names only its count:
	// the loaded pairs' hosts, methods and statuses would mislead.
	$: partial = isPartialSelection(pairs, context);
	$: selectionLabel = !summary
		? ""
		: context.all
			? context.count == null
				? "All matching"
				: `All ${context.count.toLocaleString()} matching`
			: plural(summary.count, "request");
</script>

<svelte:window on:keydown|capture={onKeydown} on:pointerdown|capture={onPointerDown} on:blur={() => open && close(false)} />

{#if open && summary}
	<div
		bind:this={root}
		tabindex="-1"
		class="ledger-row-menu fixed z-50 w-72 border border-surface-300-600-token bg-surface-100-800-token text-xs shadow-2xl"
		style="left: {position.left}px; top: {position.top}px"
		role="menu"
		aria-label="Actions for {selectionLabel}"
		on:contextmenu|preventDefault
	>
		<!-- What the menu acts on. -->
		<div class="border-b border-primary-500 px-3 py-2">
			{#if pairs.length === 1 && !context.all}
				{@const pair = pairs[0]}
				<div class="flex items-center gap-2 font-mono">
					<span class="opacity-60">#{context.numberOf?.(pair) ?? ""}</span>
					<span class={METHOD_CLASS[pair.Method] ?? ""}>{pair.Method}</span>
					<span class="ml-auto {statusClass(pair.StatusCode)}">{statusText(pair.StatusCode)}</span>
				</div>
				<div class="mt-0.5 truncate font-mono text-[11px] opacity-70" title="{pair.Host}{pair.Path}">
					{pair.Host}{pair.Path}
				</div>
			{:else}
				<div class="flex items-center gap-2">
					<span class="font-semibold">{selectionLabel}</span>
					{#if !partial}<span class="opacity-60">· {plural(summary.hosts.length, "host")}</span>{/if}
				</div>
				{#if !partial}
				<div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px]">
					{#each summary.methods as [method, count]}
						<span class={METHOD_CLASS[method] ?? ""}>{method} {count}</span>
					{/each}
					{#if summary.classes.length}
						<span class="opacity-30">|</span>
						{#each summary.classes as [statusGroup, count]}
							<span class={statusClass(Number(statusGroup[0]) * 100)}>{statusGroup} {count}</span>
						{/each}
					{/if}
				</div>
				{/if}
			{/if}
		</div>

		<div class="flex items-center gap-2 border-b border-surface-300-600-token px-3 py-1.5">
			<Search size={12} class="opacity-50" />
			<input
				bind:this={filterBox}
				bind:value={filter}
				class="ledger-row-menu-filter min-w-0 flex-1 border-0 bg-transparent p-0 text-xs focus:outline-none focus:ring-0"
				placeholder="Type an action…"
				spellcheck="false"
				autocomplete="off"
				aria-label="Filter actions"
			/>
			{#if filter}
				<button
					type="button"
					class="opacity-60 hover:opacity-100"
					aria-label="Clear the filter"
					on:click={() => {
						filter = "";
						filterBox?.focus();
					}}><X size={12} /></button
				>
			{/if}
		</div>

		<div class="relative py-1">
			{#each list as item, i}
				{#if item === "sep"}
					<div class="my-1 border-t border-surface-300-600-token"></div>
				{:else if item.heading}
					<div class="px-3 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide opacity-50">{item.heading}</div>
				{:else if isSwatchRow(item)}
					<!-- svelte-ignore a11y-mouse-events-have-key-events -->
					<div
						data-menu-index={i}
						data-menu-item={item.id}
						class="ledger-highlight-swatches flex items-center gap-1 px-3 py-[5px] {active === i ? 'bg-primary-500/20' : ''}"
						role="group"
						aria-label={item.label}
						on:mouseenter={() => {
							active = i;
							sub = null;
						}}
					>
						<span class="w-4 flex-none opacity-70"><Highlighter size={13} /></span>
						{#each item.swatches as swatch, k (swatch.id)}
							<button
								type="button"
								data-menu-item={swatch.id}
								role="menuitemradio"
								aria-checked={swatch.checked === true ? "true" : swatch.checked === "mixed" ? "mixed" : "false"}
								aria-label="Highlight: {swatch.label}"
								title={swatch.label}
								class="flex h-4 w-4 flex-none items-center justify-center rounded-full border
									{swatch.color ? 'border-transparent' : 'border-surface-500'}
									{swatch.checked === true ? 'ring-2 ring-surface-900 dark:ring-surface-50' : swatch.checked === 'mixed' ? 'ring-1 ring-surface-500' : ''}
									{active === i && swatchActive === k ? 'outline outline-2 outline-offset-1 outline-primary-500' : ''}"
								style={swatch.color ? `background: ${swatch.color}` : ""}
								on:mouseenter={() => (swatchActive = k)}
								on:mousedown|preventDefault
								on:click={() => choose(swatch)}
							>
								{#if !swatch.color}<X size={10} class="opacity-70" />{/if}
							</button>
						{/each}
						<span class="ml-1 min-w-0 flex-1 truncate text-right text-[10px] opacity-70"
							>{active === i ? item.swatches[swatchActive]?.label ?? "" : item.label}</span
						>
					</div>
				{:else}
					{@const key = shortcut(item, $menuDispatcher)}
					<button
						type="button"
						data-menu-index={i}
						data-menu-item={item.id}
						role="menuitem"
						aria-disabled={item.disabled ? "true" : undefined}
						aria-haspopup={Array.isArray(item.sub) ? "menu" : undefined}
						aria-expanded={Array.isArray(item.sub) ? sub === i : undefined}
						class="flex w-full items-center gap-2 px-3 py-[5px] text-left
							{item.disabled ? 'cursor-not-allowed opacity-40' : ''}
							{item.danger ? 'text-error-600 dark:text-error-400' : ''}
							{(active === i || sub === i) && !item.disabled ? 'bg-primary-500/20' : ''}"
						title={item.disabled ? item.hint : ""}
						on:mouseenter={() => {
							active = i;
							if (Array.isArray(item.sub) && !item.disabled) openSub(i);
							else sub = null;
						}}
						on:mousedown|preventDefault
						on:click={() => choose(item)}
					>
						<span class="w-4 flex-none opacity-70">
							{#if item.color !== undefined}
								<span
									class="block h-3 w-3 rounded-full border {item.color ? 'border-transparent' : 'border-surface-500'}"
									style={item.color ? `background: ${item.color}` : ""}
								></span>
							{:else if ICONS[item.icon]}<svelte:component this={ICONS[item.icon]} size={13} />{/if}
						</span>
						<span class="min-w-0 flex-1 truncate">
							{#if item.trail?.length}<span class="opacity-50">{item.trail.join(" › ")} › </span>{/if}{item.label}
						</span>
						{#if item.badge}<span class="badge variant-soft-primary px-1.5 py-0 text-[10px]">{item.badge}</span>{/if}
						{#if item.disabled && item.hint}<span class="text-[10px] opacity-80">{item.hint}</span>{/if}
						{#if key && !item.disabled}<kbd class="font-sans text-[10px] opacity-50">{key}</kbd>{/if}
						{#if Array.isArray(item.sub)}<ChevronRight size={12} class="opacity-60" />{/if}
					</button>
				{/if}
			{:else}
				<p class="px-3 py-2 opacity-50">No matching actions</p>
			{/each}

			{#if subItems.length}
				<div
					bind:this={subMenu}
					class="ledger-row-submenu absolute z-10 max-h-[60vh] w-72 overflow-auto border border-surface-300-600-token bg-surface-100-800-token py-1 shadow-2xl"
					style="left: {subPosition.left}px; top: {subPosition.top}px"
					role="menu"
					aria-label={list[sub].label}
				>
					{#each subItems as item, j}
						{#if item === "sep"}
							<div class="my-1 border-t border-surface-300-600-token"></div>
						{:else if item.heading}
							<div class="px-3 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide opacity-50">{item.heading}</div>
						{:else}
							{@const key = shortcut(item, $menuDispatcher)}
							<button
								type="button"
								data-menu-item={item.id}
								role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
								aria-checked={item.checked === undefined ? undefined : String(item.checked)}
								aria-disabled={item.disabled ? "true" : undefined}
								class="flex w-full items-center gap-2 px-3 py-[5px] text-left
									{item.disabled ? 'cursor-not-allowed opacity-40' : ''}
									{item.danger ? 'text-error-600 dark:text-error-400' : ''}
									{subActive === j && !item.disabled ? 'bg-primary-500/20' : ''}"
								title={item.disabled ? item.hint : item.label}
								on:mouseenter={() => (subActive = j)}
								on:mousedown|preventDefault
								on:click={() => choose(item)}
							>
								<span class="w-4 flex-none opacity-70">
									{#if item.checked === true}<Check size={13} class="text-primary-500" />
									{:else if item.checked === "mixed"}<Minus size={13} class="text-primary-500" />
									{:else if ICONS[item.icon]}<svelte:component this={ICONS[item.icon]} size={13} />{/if}
								</span>
								<span class="min-w-0 flex-1 truncate">{item.label}</span>
								{#if item.severity && SEVERITY_CLASS[item.severity]}
									<span class="px-1 text-[9px] font-bold {SEVERITY_CLASS[item.severity]}">{item.severity}</span>
								{/if}
								{#if item.disabled && item.hint}<span class="text-[10px]">{item.hint}</span>{/if}
								{#if key && !item.disabled}<kbd class="font-sans text-[10px] opacity-50">{key}</kbd>{/if}
							</button>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
		<div class="flex justify-between border-t border-surface-300-600-token px-3 py-1 text-[10px] opacity-50">
			<span>↑↓ move · → open · ↵ run</span>
			<span>⇧-click to extend</span>
		</div>
	</div>
{/if}
