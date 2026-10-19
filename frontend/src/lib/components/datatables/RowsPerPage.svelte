<script>
	export let handler;
	const rowsPerPage = handler.getRowsPerPage();
	const options = [50, 100, 200, 300, 400, 500];
</script>

<aside class="flex place-items-center text-sm">
	Show
	<select class="select ml-2 h-8 py-1 text-sm" bind:value={$rowsPerPage}>
		{#each options as option}
			<option value={option}>
				{option}
			</option>
		{/each}
	</select>
</aside>