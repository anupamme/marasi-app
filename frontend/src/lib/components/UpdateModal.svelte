<script>
	// The update details panel: the running version, the update's version and
	// its release notes (a release) or a "changes since your build" compare
	// link (a nightly), opened from the update indicator or by "Check for
	// updates…" when it finds an update. From here the researcher installs the
	// update (with progress and Cancel), then chooses Restart now or Later, or
	// dismisses it until a newer build is published. A failed install says
	// what failed; where Marasi cannot replace itself the panel offers only the
	// release page. A link opens the Channel setting.
	import { getModalStore, getToastStore, ProgressBar } from "@skeletonlabs/skeleton";
	import { Download, ExternalLink, RotateCw, Settings, X } from "lucide-svelte";
	import { goto } from "$app/navigation";
	import { BrowserOpenURL } from "../wailsjs/runtime/runtime";
	import {
		cancelUpdateDownload,
		dismissUpdate,
		installUpdate,
		restartToUpdate,
		updateState,
	} from "../../stores/updateStore";
	import { channelSettingPath, installFailureMessage, progressPercent } from "../updates.js";
	import { toastError } from "../toasts";

	export let parent;

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// The Channel setting lives in Settings → Updates.
	function openChannelSetting() {
		parent.onClose();
		goto(channelSettingPath);
	}

	function dismiss() {
		dismissUpdate()
			.then(() => parent.onClose())
			.catch((err) => toastError(toastStore, "Could not dismiss the update", err));
	}

	$: update = $updateState.Update;
	$: running = $updateState.Running;
	$: status = $updateState.Status;
	$: percent = progressPercent($updateState.Progress);
	$: canInstall =
		$updateState.CanInstall && (status === "available" || status === "failed");

	let restartError = "";

	function restart() {
		restartError = "";
		restartToUpdate().catch((err) => {
			restartError = String(err);
		});
	}

	$: heading =
		status === "restart-pending"
			? "Update installed"
			: status === "downloading"
				? "Installing update"
				: update
					? "Update available"
					: "No update available";
</script>

{#if $modalStore[0]}
	<div
		class="card p-4 w-modal shadow-xl space-y-4 bg-surface-50-800-token text-surface-900-50-token"
	>
		<header class="flex items-center justify-between">
			<h2 class="h3">{heading}</h2>
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
		<button
			type="button"
			class="anchor text-sm inline-flex items-center gap-1"
			on:click={openChannelSetting}
		>
			<Settings size={14} />
			<span>Channel setting</span>
		</button>

		{#if status === "downloading"}
			<section class="space-y-2" aria-live="polite">
				<ProgressBar
					value={percent ?? undefined}
					max={100}
					height="h-2"
				/>
				<p class="text-sm opacity-70">
					{percent === null
						? "Downloading and verifying…"
						: `Downloading… ${percent}%`}
				</p>
			</section>
		{:else if status === "restart-pending"}
			<p class="text-sm">
				Marasi {update?.Version} is installed. Restart now to run it, or
				later: the next launch runs it either way.
			</p>
			{#if restartError}
				<p class="text-sm text-error-500">{restartError}</p>
			{/if}
		{:else if update}
			{#if status === "failed" && $updateState.Failure}
				<aside class="alert variant-soft-error text-sm" role="alert">
					<p>
						{installFailureMessage($updateState.Failure)}. Your installed
						Marasi was left as it was; you can install the update by hand
						from the release page.
					</p>
				</aside>
			{/if}
			{#if !$updateState.CanInstall}
				<aside class="alert variant-soft-warning text-sm">
					<p>
						{$updateState.CannotInstallReason}. Install the update from
						the release page.
					</p>
				</aside>
			{/if}
			{#if update.CompareURL}
				<section class="space-y-2">
					<h3 class="h5">Changes since your build</h3>
					<button
						type="button"
						class="anchor text-sm inline-flex items-center gap-1"
						on:click={() => BrowserOpenURL(update.CompareURL)}
					>
						<span>Compare your build with this nightly on GitHub</span>
						<ExternalLink size={14} />
					</button>
				</section>
			{:else}
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
			{#if status === "downloading"}
				<button
					type="button"
					class="btn variant-ghost-surface btn-sm"
					on:click={cancelUpdateDownload}>Cancel</button
				>
			{:else if status === "restart-pending"}
				<button
					type="button"
					class="btn variant-ghost-surface btn-sm"
					on:click={parent.onClose}>Later</button
				>
				<button
					type="button"
					class="btn variant-filled-primary btn-sm"
					on:click={restart}
				>
					<RotateCw size={14} />
					<span>Restart now</span>
				</button>
			{:else}
				{#if update}
					<button
						type="button"
						class="btn variant-ghost-surface btn-sm"
						title="Hide this update until a newer build is published"
						on:click={dismiss}>Dismiss</button
					>
				{/if}
				{#if canInstall}
					<button
						type="button"
						class="btn variant-filled-primary btn-sm"
						on:click={installUpdate}
					>
						<Download size={14} />
						<span>{status === "failed" ? "Try again" : "Install"}</span>
					</button>
				{/if}
				<button
					type="button"
					class="btn variant-filled btn-sm"
					on:click={parent.onClose}>Close</button
				>
			{/if}
		</footer>
	</div>
{/if}
