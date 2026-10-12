<script>
	import { SendIcon, FlagIcon, EditIcon, Replace, Radio, Edit2Icon, Swords } from "lucide-svelte";
	import { upgradeFromLedgerRow, upgradePresentation } from "../websocket/presentation.js";

	export let index;
	export let row;

	$: upgrade = upgradePresentation(upgradeFromLedgerRow(row));

	$: activeIcons = [
		{
			show: upgrade.isUpgrade,
			component: Radio,
			className: upgrade.iconClass,
			slashed: upgrade.slashed,
			tooltip: upgrade.tooltip,
		},
		{ show: row.Metadata?.launchpad, component: SendIcon },
		{ show: row.Metadata?.armory_run_id, component: Swords },
		{ show: row.Metadata?.intercepted, component: FlagIcon },
		{
			show: row.Metadata?.intercepted && row.Metadata["original-request"] !== row.Raw,
			component: EditIcon,
		},
		{
			show: row.Metadata?.intercepted && row.Metadata["original-response"] !== row.Raw,
			component: EditIcon,
		},
		{ show: row.Metadata?.has_note == 1, component: Edit2Icon },
		{ show: row.Metadata?.override_host, component: Replace },
	].filter((i) => i.show);
</script>

<div class="flex flex-row items-center">
	<span class="min-w-[1rem] inline-block text-right font-mono mr-3">
		{index}
	</span>

	{#if activeIcons.length > 0}
		<div class="flex flex-row gap-1">
			{#each activeIcons as icon}
				{#if icon.slashed}
					<!-- The slash is drawn over the icon inside its own 14px box, so
					     the icon's size and the row's spacing don't change. -->
					<span
						class="relative inline-flex h-[14px] w-[14px] shrink-0 {icon.className || ''}"
						title={icon.tooltip}
						aria-label={icon.tooltip}
					>
						<svelte:component this={icon.component} size="14" />
						<svg
							class="pointer-events-none absolute inset-0"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<line x1="3" y1="3" x2="21" y2="21" />
						</svg>
					</span>
				{:else}
					<svelte:component this={icon.component} size="14" class={icon.className || ""} />
				{/if}
			{/each}
		</div>
	{:else}
		<div class="flex flex-row gap-1 items-center justify-center w-[14px]">
			<div class="w-1 h-1 rounded-full bg-surface-400/20"></div>
		</div>
	{/if}
</div>
