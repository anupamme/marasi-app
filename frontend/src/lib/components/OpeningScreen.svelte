<script>
	// The opening screen: what opening a project is doing, step by step.
	// It renders only what lib/openProgress.js returns for the open in
	// progress; the layout shows it while the app isn't ready.
	import { modeCurrent, ProgressBar } from "@skeletonlabs/skeleton";
	import { Check, ChevronDown, ChevronRight } from "lucide-svelte";
	import Logo from "./Logo.svelte";
	import { openingScreen } from "../openProgress.js";

	/** The open in progress (openProgress.js state). */
	export let state;

	$: screen = openingScreen(state);
	let showLog = false;

	const bar = {
		height: "h-2",
		rounded: "rounded-none",
		meter: "bg-primary-500",
		track: "bg-surface-200 dark:bg-surface-700",
	};
</script>

<div class="flex h-full w-full items-center justify-center">
	<div class="w-[440px]">
		<header class="flex items-center gap-3">
			<Logo size="36" mode={$modeCurrent ? "light" : "dark"} />
			<div class="min-w-0">
				<h1 class="text-base font-bold">{screen.project.name}</h1>
				{#if screen.project.path}
					<p class="truncate font-mono text-[11px] opacity-60" title={screen.project.path}>
						{screen.project.path}
					</p>
				{/if}
			</div>
		</header>

		<ol class="mt-5 flex items-center" aria-label="Open steps">
			{#each screen.steps as step, i (step.id)}
				<li
					class="relative flex shrink-0 items-center gap-2"
					aria-current={step.mark === "current" || step.mark === "failed" ? "step" : undefined}
				>
					<span
						class="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-bold
						{step.mark === 'failed'
							? 'bg-error-500 text-white'
							: step.mark === 'done'
								? 'bg-primary-500 text-white'
								: step.mark === 'current'
									? 'ring-2 ring-primary-500 bg-surface-50 dark:bg-surface-800'
									: 'bg-surface-300 dark:bg-surface-600'}"
					>
						{#if step.mark === "failed"}!{:else if step.mark === "done"}<Check size={12} />{/if}
					</span>
					<span
						class="text-sm leading-5 {step.mark === 'failed'
							? 'font-semibold text-error-600 dark:text-error-400'
							: step.mark === 'current'
								? 'font-semibold'
								: step.mark === 'todo'
									? 'opacity-60'
									: ''}"
					>
						{step.label}
					</span>
				</li>
				{#if i < screen.steps.length - 1}
					<li
						aria-hidden="true"
						class="mx-3 h-px flex-1 {step.mark === 'done'
							? 'bg-primary-500'
							: 'bg-surface-300 dark:bg-surface-600'}"
					/>
				{/if}
			{/each}
		</ol>

		<div class="mt-5 min-h-[64px] text-sm">
			<p>{screen.sentence}</p>
			{#if screen.upgrade}
				<div class="mt-3"><ProgressBar {...bar} /></div>
				<p class="mt-1 font-mono text-xs opacity-60">
					{screen.upgrade.file} · {screen.upgrade.applied} applied
				</p>
			{:else if screen.load.part}
				<div class="mt-3">
					<ProgressBar {...bar} value={screen.load.done} max={screen.load.total} />
				</div>
			{:else if screen.load.done < screen.load.total}
				<div class="mt-3"><ProgressBar {...bar} /></div>
			{/if}
		</div>

		<button
			class="mt-6 flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
			aria-expanded={showLog}
			on:click={() => (showLog = !showLog)}
		>
			{#if showLog}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}
			Details
		</button>
		{#if showLog}
			<pre
				class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all bg-surface-100 p-2 font-mono text-[11px] leading-5 dark:bg-surface-800">{screen.log.join("\n")}</pre>
		{/if}
	</div>
</div>
