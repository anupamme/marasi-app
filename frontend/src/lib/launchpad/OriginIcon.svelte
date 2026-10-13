<script>
	// lucide "line-dot-left-horizontal", inlined because the bundled
	// lucide-svelte 0.468 predates it. Marks a launchpad's original entry.
	export let size = 12;
	let className = "";
	export { className as class };
</script>

<svg
	class={className}
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	role="img"
	aria-label="Original entry"
>
	<path d="M9 12h12" />
	<circle cx="6" cy="12" r="3" />
</svg>
