<script>
	// One of the Ledger drawer's CodeMirror editors: the app's light and dark
	// themes and Vim setting, 11px text like the table's rows and the drawer's chrome, filling its
	// pane and scrolling inside it.
	import CodeMirror from "svelte-codemirror-editor";
	import { StreamLanguage } from "@codemirror/language";
	import { http } from "@codemirror/legacy-modes/mode/http";
	import { oneDark } from "@codemirror/theme-one-dark";
	import { githubLight } from "@uiw/codemirror-theme-github";
	import { vim } from "@replit/codemirror-vim";
	import { modeCurrent } from "@skeletonlabs/skeleton";
	import { marasiConfig } from "../../stores";

	export let value = "";
	/** A CodeMirror language, or "http" for a request or response. */
	export let lang = undefined;
	export let wrap = false;
	export let readonly = true;
	export let placeholder = undefined;

	const httpLanguage = StreamLanguage.define(http);
	const styles = {
		"&": { height: "100%", fontSize: "11px" },
		// Scrolling stops at the editor's edges: no bounce past them and no
		// scroll passed on to the page.
		".cm-scroller": { overflow: "auto", overscrollBehavior: "contain" },
		// The pane around the editor keeps the first line off the drawer's
		// top line.
		".cm-content": { paddingTop: "0" },
	};
</script>

<!-- An editable one reports every change at once (nodebounce), so a change
     is never lost to the editor's own debounce when it closes. -->
<CodeMirror
	class="ledger-editor h-full min-h-0"
	bind:value
	lang={lang === "http" ? httpLanguage : lang}
	theme={$modeCurrent ? githubLight : oneDark}
	extensions={$marasiConfig.VimEnabled ? [vim()] : []}
	{readonly}
	lineWrapping={wrap}
	{placeholder}
	{styles}
	nodebounce={!readonly}
	on:change
/>
