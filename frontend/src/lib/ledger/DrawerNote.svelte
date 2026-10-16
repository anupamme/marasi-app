<script>
	// The focused pair's note, edited in place of the response pane. Edits
	// save themselves a moment after typing stops, and whatever is unsaved
	// when the pane closes (or the drawer moves to another pair) is saved
	// then. Saves run one at a time, in order. Each edit is dispatched as
	// `edit` ({ id, text }) so the details column's preview follows it.
	import { createEventDispatcher, onDestroy } from "svelte";
	import { X } from "lucide-svelte";
	import DrawerEditor from "./DrawerEditor.svelte";

	/** Saves the note: (id, text) => Promise. */
	export let save;
	/** The pair's ID and number. */
	export let id;
	export let number;
	/** The note's text, as loaded. */
	export let text = "";

	// How long after the last keystroke an edit saves.
	const SAVE_DELAY_MS = 600;

	const dispatch = createEventDispatcher();
	// The text Marasi holds, and "saved", "unsaved", "saving" or "failed".
	let value = text;
	let savedText = text;
	let status = "saved";
	let timer = null;
	let saving = Promise.resolve();

	function onChange(event) {
		value = event.detail;
		dispatch("edit", { id, text: value });
		clearTimeout(timer);
		if (value === savedText) {
			status = "saved";
			return;
		}
		status = "unsaved";
		timer = setTimeout(saveNow, SAVE_DELAY_MS);
	}

	function saveNow() {
		clearTimeout(timer);
		timer = null;
		const pending = value;
		if (pending === savedText) return;
		status = "saving";
		saving = saving.then(() =>
			save(id, pending).then(
				() => {
					savedText = pending;
					status = value === savedText ? "saved" : "unsaved";
				},
				(error) => {
					console.error("Saving the note failed:", error);
					status = "failed";
				},
			),
		);
	}

	onDestroy(saveNow);

	const STATUS = { saved: "Saved", unsaved: "Edited", saving: "Saving…", failed: "Not saved" };
</script>

<div class="ledger-drawer-note flex h-full min-h-0 flex-col">
	<div
		class="flex h-7 flex-none items-center gap-2 whitespace-nowrap border-b border-primary-500 bg-surface-100 px-3 text-[11px] dark:bg-surface-800"
	>
		<span class="font-semibold uppercase tracking-wide">Note</span>
		<span class="opacity-60">Request {number}</span>
		<span class="flex-1"></span>
		{#if status === "failed"}
			<button
				class="ledger-note-status text-error-500 hover:underline"
				title="Marasi failed to save the note. Try again"
				on:click={saveNow}>{STATUS.failed} · Retry</button
			>
		{:else}
			<span class="ledger-note-status opacity-60" role="status">{STATUS[status]}</span>
		{/if}
		<button
			class="flex h-5 w-5 items-center justify-center hover:bg-surface-200-700-token"
			title="Back to the response"
			aria-label="Back to the response"
			on:click={() => dispatch("close")}><X size={12} /></button
		>
	</div>
	<div class="min-h-0 flex-1">
		<DrawerEditor
			{value}
			readonly={false}
			wrap
			placeholder="Write a note for this request…"
			on:change={onChange}
		/>
	</div>
</div>
