<script context="module">
	// Survive page visits within a session.
	let savedWidth;
	let savedAutoHide = false;
</script>

<script>
	// The Launchpad dock: drag the edge to resize, drag below the snap point
	// to collapse to a strip. With auto-hide on, focusing the editor
	// collapses it and hovering the strip peeks the tree. The page binds
	// launchpad.toggle-sidebar to toggle().
	import { tick } from "svelte";
	import { Eye, EyeOff, PanelLeftClose, PanelLeftOpen, Search } from "lucide-svelte";
	import { dirtyLaunchpadIds } from "../../stores/launchpadStore";
	import { DOCK, dragWidth, settleDrag } from "./dock.js";

	export let store;
	/** The tree's search box, focused by the strip's search button. */
	export let searchInput = null;

	let width = savedWidth ?? DOCK.default;
	let autoHide = savedAutoHide;
	$: savedWidth = width;
	$: savedAutoHide = autoHide;

	let collapsed = false;
	let peeking = false;
	let dragging = false;
	let liveWidth = width;
	let peekTimer;

	$: dirtyCount = dirtyLaunchpadIds($store).length;
	$: current = $store.launchpads.find((l) => l.ID === $store.selectedLaunchpadId);
	$: panelWidth = dragging ? liveWidth : width;
	$: overlay = collapsed && peeking && !dragging;

	export async function expand(focusSearch = false) {
		collapsed = false;
		peeking = false;
		if (focusSearch) {
			await tick();
			searchInput?.focus();
		}
	}
	export function toggle() {
		if (collapsed) expand();
		else collapsed = true;
	}
	/** Call when the request editor gains focus. */
	export function onEditorFocus() {
		if (!autoHide) return;
		collapsed = true;
		peeking = false;
	}

	function peek(on, delay) {
		if (!autoHide) return;
		clearTimeout(peekTimer);
		peekTimer = setTimeout(() => (peeking = on), delay);
	}

	function startDrag(event) {
		const startX = event.clientX;
		const startWidth = collapsed ? 0 : width;
		dragging = true;
		liveWidth = startWidth;
		collapsed = false;
		const move = (e) => (liveWidth = dragWidth(startWidth, e.clientX - startX));
		const up = () => {
			dragging = false;
			({ collapsed, width } = settleDrag(liveWidth, width));
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}
</script>

{#if collapsed && !dragging}
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<aside
		class="lp-strip z-30 flex w-11 flex-none flex-col items-center gap-2 border-r border-surface-500/30 bg-surface-100 py-2 dark:bg-surface-800"
		on:mouseenter={() => peek(true, 150)}
		on:mouseleave={() => peek(false, 250)}
	>
		<button
			class="btn btn-sm variant-soft px-2"
			title="Show launchpads"
			aria-label="Show launchpads"
			on:click={() => expand()}
		>
			<PanelLeftOpen size={16} />
		</button>
		<button
			class="btn btn-sm hover:variant-soft px-2"
			title="Search launchpads"
			aria-label="Search launchpads"
			on:click={() => expand(true)}
		>
			<Search size={16} />
		</button>
		{#if dirtyCount}
			<span
				class="badge variant-filled-warning px-1.5 py-0 text-[10px]"
				title="{dirtyCount} unsaved {dirtyCount === 1 ? 'draft' : 'drafts'}">{dirtyCount}</span
			>
		{/if}
		<button
			class="mt-2 max-h-[60vh] truncate text-xs font-bold opacity-70 [writing-mode:vertical-rl] hover:opacity-100"
			title={current?.Name ?? ""}
			on:click={() => expand()}
		>
			{current?.Name ?? ""}
		</button>
	</aside>
{/if}

{#if !collapsed || dragging || peeking}
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<aside
		class="lp-dock {overlay
			? 'absolute bottom-0 left-11 top-0 z-20 shadow-2xl'
			: 'relative flex-none'} flex flex-col overflow-hidden border-r border-surface-500/30 bg-surface-50 dark:bg-surface-900"
		style="width: {overlay ? width : panelWidth}px"
		on:mouseenter={() => clearTimeout(peekTimer)}
		on:mouseleave={() => collapsed && peek(false, 250)}
	>
		<!-- Content keeps at least the minimum width while dragging narrower. -->
		<div class="flex h-full min-h-0 flex-col" style="width: {Math.max(overlay ? width : panelWidth, DOCK.min)}px">
			<div
				class="flex items-center justify-end gap-2 border-b border-surface-500/30 bg-surface-50 px-2 py-1 text-[10px] dark:bg-surface-900"
			>
				<button
					class="flex items-center gap-1 opacity-70 hover:opacity-100"
					title="Collapse the sidebar when the editor is focused"
					aria-pressed={autoHide}
					on:click={() => (autoHide = !autoHide)}
				>
					{#if autoHide}<EyeOff size={12} />{:else}<Eye size={12} />{/if}
					Auto-hide while editing: {autoHide ? "on" : "off"}
				</button>
				{#if !collapsed}
					<button
						class="opacity-70 hover:opacity-100"
						title="Collapse"
						aria-label="Collapse sidebar"
						on:click={() => (collapsed = true)}
					>
						<PanelLeftClose size={12} />
					</button>
				{/if}
			</div>
			<div class="min-h-0 flex-1">
				<slot />
			</div>
		</div>
		{#if dragging && liveWidth < DOCK.snap}
			<div class="absolute inset-0 flex items-center justify-center bg-surface-900/70 text-xs text-white">
				Release to collapse
			</div>
		{/if}
	</aside>
{/if}

{#if !collapsed || dragging}
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="lp-resize w-1 flex-none cursor-col-resize transition-colors hover:bg-primary-500/60 {dragging
			? 'bg-primary-500'
			: ''}"
		title="Drag to resize, drag left to collapse"
		on:pointerdown|preventDefault={startDrag}
	></div>
{/if}
