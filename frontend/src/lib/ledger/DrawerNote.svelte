<script>
	// The focused pair's note, edited in place of the response pane. Edits
	// save themselves a moment after typing stops, and whatever is unsaved
	// when the pane closes (or the drawer moves to another pair) is saved
	// then. Saves run one at a time, in order; after a failed save the next
	// edit tries again. Each edit is dispatched as `edit` ({ id, text }) so
	// the details column's preview follows it, and the save state as
	// `status` so the rail can show it.
	import { createEventDispatcher, onDestroy } from "svelte";
	import DrawerEditor from "./DrawerEditor.svelte";

	/** Saves the note: (id, text) => Promise. */
	export let save;
	/** The pair's ID. */
	export let id;
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

	$: dispatch("status", status);
</script>

<div class="ledger-drawer-note h-full min-h-0" data-status={status}>
	<DrawerEditor {value} readonly={false} wrap placeholder="Write a note for this request…" on:change={onChange} />
</div>
