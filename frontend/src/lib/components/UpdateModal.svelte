<script>
	// The update details panel: the running version, the update's version and
	// its release notes, opened from the update indicator or by "Check for
	// updates…" when it finds an update. Dismiss hides the update until a
	// newer build is published. Install and the nightly compare link are
	// added by later work on updates.
	import { getModalStore, getToastStore } from "@skeletonlabs/skeleton";
	import { ExternalLink, X } from "lucide-svelte";
	import { BrowserOpenURL } from "../wailsjs/runtime/runtime";
	import { dismissUpdate, updateState } from "../../stores/updateStore";
	import { toastError } from "../toasts";

	export let parent;

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	function dismiss() {
		dismissUpdate()
			.then(() => parent.onClose())
			.catch((err) => toastError(toastStore, "Could not dismiss the update", err));
	}

	$: update = $updateState.Update;
	$: running = $updateState.Running;
</script>

{#if $modalStore[0]}
	<div
		class="card p-4 w-modal shadow-xl space-y-4 bg-surface-50-800-token text-surface-900-50-token"
	>
		<header class="flex items-center justify-between">
			<h2 class="h3">
				{update ? "Update available" : "No update available"}
			</h2>
			<button
				type="button"
				class="btn-icon btn-icon-sm"
				aria-label="Close"
				on:click={parent.onClose}
			>
				<X size={16} />
			</button>
		</header>

		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
			<dt class="opacity-70">Running</dt>
			<dd class="font-mono">{running?.Version ?? "unknown"}</dd>
			{#if update}
				<dt class="opacity-70">Update</dt>
				<dd class="font-mono">{update.Version}</dd>
				<dt class="opacity-70">Channel</dt>
				<dd class="capitalize">{update.Channel}</dd>
			{/if}
		</dl>

		{#if update}
			<section class="space-y-2">
				<h3 class="h5">Release notes</h3>
				{#if update.Notes}
					<pre
						class="whitespace-pre-wrap break-words text-sm p-3 rounded-container-token bg-surface-100-800-token max-h-80 overflow-auto font-sans">{update.Notes}</pre>
				{:else}
					<p class="text-sm opacity-70">This release has no notes.</p>
				{/if}
			</section>
		{/if}

		<footer class="flex justify-end gap-2">
			{#if update?.ReleasePage}
				<button
					type="button"
					class="btn variant-ghost-surface btn-sm"
					on:click={() => BrowserOpenURL(update.ReleasePage)}
				>
					<ExternalLink size={14} />
					<span>Release page</span>
				</button>
			{/if}
			{#if update}
				<button
					type="button"
					class="btn variant-ghost-surface btn-sm"
					title="Hide this update until a newer build is published"
					on:click={dismiss}>Dismiss</button
				>
			{/if}
			<button
				type="button"
				class="btn variant-filled btn-sm"
				on:click={parent.onClose}>Close</button
			>
		</footer>
	</div>
{/if}
