<script>
	// Settings, one section at a time. The sections list is styled like
	// Marasi menu entries; each setting is a row with its name and help on
	// the left and its control in one fixed-width column on the right, so
	// inputs, buttons and switches line up. Lists are tables with the add
	// row underneath.
	import { Chrome, FileType, Globe, Highlighter, Info, Keyboard, Pencil, Replace, X } from "lucide-svelte";
	import {
		CreateWaypoint,
		DeleteWaypoint,
		SetFlag,
		ToggleFlag,
		GetChromePaths,
		AddChromePath,
		DeleteChromePath,
		GetChromeProfiles,
		AddChromeProfile,
		DeleteChromeProfile,
		GetBuildInfo,
	} from "../../lib/wailsjs/go/main/App";
	import {
		keybindingState,
		marasiConfig,
		populateWaypoints,
		waypoints,
	} from "../../stores";
	import {
		getModalStore,
		getToastStore,
		SlideToggle,
		modeCurrent,
	} from "@skeletonlabs/skeleton";
	import { onMount } from "svelte";
	import { chromeError } from "../../lib/globalActions.js";
	import { primaryVariant } from "../../lib/launchpad/format.js";
	import {
		highlightPalette,
		resetHighlights,
		saveHighlights,
	} from "../../stores/highlightsStore.js";
	import { ledgerStore, select } from "../../stores/ledgerStore";
	import {
		groupOf,
		isExclusionValue,
		normalizeContentType,
	} from "../../lib/ledger/contentTypes.js";
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	const sections = [
		{ id: "editing", name: "Keyboard & Editor", hint: "Shortcuts, Vim, syntax", icon: Keyboard },
		{ id: "listener", name: "Listener", hint: "Default interface and port", icon: Globe },
		{ id: "waypoints", name: "Waypoints", hint: "Host overrides", icon: Replace },
		{ id: "browser", name: "Browser", hint: "Chrome paths and profiles", icon: Chrome },
		{ id: "highlights", name: "Highlights", hint: "Colours and labels", icon: Highlighter },
		{ id: "content-types", name: "Content Types", hint: "Types the Ledger hides", icon: FileType },
		{ id: "about", name: "About", hint: "Version and build", icon: Info },
	];
	const syntaxModes = [
		["disabled", "Disabled"],
		["auto", "Auto"],
		["enabled", "Enabled"],
	];
	let section = "editing";

	let targetHost = "";
	let override = "";
	let selected = "";
	let selectedOS = "";
	let selectedPath = "";
	let selectedProfile = "";
	let chromePaths = [];
	let chromeProfiles = [];
	let buildInfo = null;
	let newContentType = "";

	// The app default content-type exclusion, which every project follows
	// until it keeps its own list from the Ledger's Types menu.
	const defaultExclusion = select(ledgerStore, (state) => state.defaultExclusion ?? []);
	$: newContentTypeValue = normalizeContentType(newContentType);
	$: canAddContentType =
		isExclusionValue(newContentTypeValue) && !$defaultExclusion.includes(newContentTypeValue);

	$: primary = primaryVariant($modeCurrent);
	$: iconButton = `btn-icon inline-flex items-center justify-center p-1 w-auto h-auto ${primary}`;
	const tableField =
		"input w-full bg-white dark:bg-surface-700 border-0 ring-0 focus:border-0 focus:ring-0";
	const row =
		"flex items-center justify-between gap-8 py-4 border-b border-surface-300 dark:border-surface-600";
	const control = "flex w-80 shrink-0";

	$: keybindingSummary = (() => {
		const config = $keybindingState?.config;
		const active = config?.profiles?.find(
			(profile) => profile.id === config.activeProfile,
		);
		if (!active) return "Factory shortcuts";
		const count = config.profiles.length;
		return `${active.name} profile active · ${count} profile${count === 1 ? "" : "s"}`;
	})();

	function openKeybindings() {
		modalStore.trigger({ type: "component", component: "Keybindings" });
	}
	function setFlag(name, value) {
		SetFlag(name, value).then((config) => {
			marasiConfig.set(config);
		});
	}
	function saveWaypoint() {
		CreateWaypoint(targetHost, override)
			.then(() => {
				targetHost = "";
				override = "";
				selected = "";
				populateWaypoints();
			})
			.catch((waypointErr) => {
				console.log(waypointErr);
			});
	}
	function deleteWaypoint(host) {
		DeleteWaypoint(host)
			.then(() => {
				populateWaypoints();
			})
			.catch((deleteError) => {
				console.log(deleteError);
			});
	}
	function addChromePath() {
		AddChromePath(selectedPath, selectedOS)
			.then((paths) => {
				chromePaths = paths;
				selectedPath = "";
				selectedOS = "";
			})
			.catch(chromeError(toastStore, "Error adding path"));
	}
	function deleteChromePath(path) {
		DeleteChromePath(path.Path, path.OS)
			.then((paths) => {
				chromePaths = paths;
			})
			.catch(chromeError(toastStore, "Error deleting path"));
	}
	function addChromeProfile() {
		AddChromeProfile(selectedProfile)
			.then((profiles) => {
				chromeProfiles = profiles;
			})
			.catch((error) =>
				chromeError(
					toastStore,
					String(error).includes("already exists")
						? "Profile already exists"
						: "Error creating profile",
				)(error),
			);
		selectedProfile = "";
	}
	function deleteChromeProfile(profile) {
		DeleteChromeProfile(profile)
			.then((profiles) => {
				chromeProfiles = profiles;
			})
			.catch(chromeError(toastStore, "Error deleting profile"));
	}

	// Each change saves all 8 app highlights, so the form mirrors the file.
	function saveHighlight(number, change) {
		const next = $highlightPalette.map((h) => ({ color: h.color, label: h.appLabel ?? "" }));
		next[number - 1] = { ...next[number - 1], ...change };
		saveHighlights(next).catch((error) => {
			toastStore.trigger({
				message: `Error saving highlights: ${error}`,
				background: "variant-filled-error",
			});
		});
	}
	function confirmResetHighlights() {
		modalStore.trigger({
			type: "confirm",
			title: "Reset highlights?",
			body: "Restores the default colours and clears every app-wide label. Project labels are kept.",
			response: (ok) => {
				if (!ok) return;
				resetHighlights().catch((error) => {
					toastStore.trigger({
						message: `Error resetting highlights: ${error}`,
						background: "variant-filled-error",
					});
				});
			},
		});
	}

	function saveDefaultExclusion(types) {
		ledgerStore.saveDefaultExclusion(types).catch((error) => {
			toastStore.trigger({
				message: `Error saving the default content types: ${error}`,
				background: "variant-filled-error",
			});
			ledgerStore.loadDefaultExclusion().catch(() => {});
		});
	}
	function addDefaultContentType() {
		if (!canAddContentType) return;
		saveDefaultExclusion([...$defaultExclusion, newContentTypeValue]);
		newContentType = "";
	}

	onMount(() => {
		ledgerStore.loadDefaultExclusion().catch((error) => {
			console.error("Reading the default content types failed:", error);
		});
		GetBuildInfo().then((info) => {
			buildInfo = info;
		});
		GetChromePaths()
			.then((paths) => {
				chromePaths = paths;
			})
			.catch(chromeError(toastStore, "Error reading Chrome paths"));
		GetChromeProfiles()
			.then((profiles) => {
				chromeProfiles = profiles;
			})
			.catch(chromeError(toastStore, "Error reading Chrome profiles"));
	});
</script>

<div class="no-select flex h-full min-h-0 flex-col p-4 text-surface-900-50-token">
	<header class="mb-4 flex items-baseline gap-3">
		<h2 class="text-2xl font-bold">Marasi Settings</h2>
		{#if buildInfo}
			<span
				class="font-mono text-sm"
				class:text-primary-500={buildInfo.Channel === "nightly"}
				class:text-success-500={buildInfo.Channel === "release"}
				class:opacity-60={buildInfo.Channel === "dev"}
			>
				{buildInfo.Version}
			</span>
		{/if}
	</header>

	<div class="flex min-h-0 flex-1 border-t border-surface-300 dark:border-surface-600">
		<nav
			class="w-64 shrink-0 overflow-y-auto border-r border-surface-300 py-2 dark:border-surface-600"
			aria-label="Settings sections"
		>
			{#each sections as entry}
				<button
					type="button"
					class="flex w-full items-center gap-3 border-l-4 px-3 py-2 text-left hover:bg-surface-200 focus:!outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 dark:hover:bg-surface-700 {section ===
					entry.id
						? 'border-primary-500 bg-surface-200 dark:bg-surface-700'
						: 'border-transparent'}"
					aria-current={section === entry.id ? "true" : undefined}
					on:click={() => (section = entry.id)}
				>
					<svelte:component this={entry.icon} size={18} class="shrink-0 opacity-80" />
					<span class="flex flex-col">
						<span>{entry.name}</span>
						<span class="text-sm opacity-70">{entry.hint}</span>
					</span>
				</button>
			{/each}
		</nav>

		<section class="min-w-0 flex-1 overflow-y-auto px-8 py-4">
			{#if section === "editing"}
				<h3 class="text-xl font-bold">Keyboard & Editor</h3>
				<div class={row}>
					<div>
						<p>Keybindings</p>
						<p class="text-sm opacity-70">{keybindingSummary}</p>
					</div>
					<div class={control}>
						<button type="button" class="btn w-full {primary}" on:click={openKeybindings}
							>Configure Keybindings</button
						>
					</div>
				</div>
				<div class={row}>
					<div>
						<p>Vim mode</p>
						<p class="text-sm opacity-70">Vim keys in every code editor</p>
					</div>
					<div class="{control} justify-end">
						<SlideToggle
							name="vim-enabled"
							label="Vim mode"
							active="bg-primary-500"
							bind:checked={$marasiConfig.VimEnabled}
							on:change={() => {
								ToggleFlag("vim_enabled").then((config) => {
									marasiConfig.set(config);
								});
							}}
						/>
					</div>
				</div>
				<div class={row}>
					<div>
						<p>Syntax highlighting</p>
						<p class="text-sm opacity-70">
							Auto highlights requests and responses it recognises
						</p>
					</div>
					<div class="{control} grid grid-cols-3" role="radiogroup" aria-label="Syntax highlighting">
						{#each syntaxModes as [value, label]}
							<button
								type="button"
								role="radio"
								aria-checked={$marasiConfig.SyntaxMode === value}
								class="btn !border-0 !ring-0 {$marasiConfig.SyntaxMode === value
									? 'variant-filled-primary'
									: 'variant-soft-primary !text-surface-900 dark:!text-surface-50'}"
								on:click={() => setFlag("syntax_mode", value)}>{label}</button
							>
						{/each}
					</div>
				</div>
			{:else if section === "listener"}
				<h3 class="text-xl font-bold">Listener</h3>
				<p class="text-sm opacity-70">
					Used when Marasi starts. Change the running listener from the dashboard.
				</p>
				<div class={row}>
					<div>
						<p>Default interface</p>
						<p class="text-sm opacity-70">Address the proxy listens on</p>
					</div>
					<div class={control}>
						<input
							class="input w-full"
							type="text"
							placeholder="Listener"
							aria-label="Default interface"
							bind:value={$marasiConfig.DefaultAddress}
							on:change={(event) => setFlag("default_address", event?.target?.value)}
						/>
					</div>
				</div>
				<div class={row}>
					<div>
						<p>Default port</p>
						<p class="text-sm opacity-70">Port the proxy listens on</p>
					</div>
					<div class={control}>
						<input
							class="input w-full"
							type="text"
							placeholder="Listener"
							aria-label="Default port"
							bind:value={$marasiConfig.DefaultPort}
							on:change={(event) => setFlag("default_port", event?.target?.value)}
						/>
					</div>
				</div>
			{:else if section === "waypoints"}
				<h3 class="text-xl font-bold">Waypoints</h3>
				<p class="mb-4 text-sm opacity-70">Send traffic for a host to a different host:port.</p>
				<div class="table-container">
					<table class="table">
						<thead>
							<tr>
								<th class="w-[40%]">Host</th>
								<th class="w-[40%]">Override</th>
								<th class="w-[20%]"></th>
							</tr>
						</thead>
						<tbody>
							{#each Object.keys($waypoints) as host}
								<tr>
									<td class="font-mono">{host}</td>
									<td class="font-mono">{$waypoints[host]}</td>
									<td class="text-center">
										<div class="flex items-center justify-center space-x-2">
											<button
												type="button"
												class={iconButton}
												title="Edit"
												on:click={() => {
													selected = host;
													targetHost = host;
													override = $waypoints[host];
												}}><Pencil size={15} /></button
											>
											<button
												type="button"
												class={iconButton}
												title="Delete"
												on:click={() => deleteWaypoint(host)}><X size={15} /></button
											>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<td>
									<input
										type="text"
										placeholder="Enter host (host:port)"
										class={tableField}
										bind:value={targetHost}
									/>
								</td>
								<td>
									<input
										type="text"
										placeholder="Enter override (host:port)"
										class={tableField}
										bind:value={override}
									/>
								</td>
								<td>
									<button
										type="button"
										class="btn w-full {primary}"
										disabled={targetHost === "" ||
											override === "" ||
											(targetHost in $waypoints && selected !== targetHost)}
										on:click={saveWaypoint}
										>{selected === targetHost && targetHost !== ""
											? "Update Waypoint"
											: "Add Waypoint"}</button
									>
								</td>
							</tr>
						</tfoot>
					</table>
				</div>
			{:else if section === "content-types"}
				<h3 class="text-xl font-bold">Content Types</h3>
				<p class="mb-4 text-sm opacity-70">
					The Ledger hides these content types in every project that follows the app default. A value is
					an exact type (text/css) or a whole major type (image/*). A project whose list is edited in the
					Ledger's Types menu keeps its own until it is reset to the default.
				</p>
				<div class="table-container">
					<table class="table" id="settingsDefaultContentTypes">
						<thead>
							<tr>
								<th class="w-[60%]">Content type</th>
								<th class="w-[25%]">Group</th>
								<th class="w-[15%]"></th>
							</tr>
						</thead>
						<tbody>
							{#each $defaultExclusion as type (type)}
								<tr data-type={type}>
									<td class="font-mono">{type}</td>
									<td class="opacity-70">{groupOf(type)?.label ?? ""}</td>
									<td class="text-center">
										<button
											type="button"
											class={iconButton}
											title="Remove {type}"
											aria-label="Remove {type}"
											on:click={() =>
												saveDefaultExclusion($defaultExclusion.filter((t) => t !== type))}
											><X size={15} /></button
										>
									</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<td colspan="2">
									<input
										id="settingsNewContentType"
										type="text"
										placeholder="Enter a content type (type/subtype or type/*)"
										class="{tableField} font-mono"
										spellcheck="false"
										autocomplete="off"
										bind:value={newContentType}
										on:keydown={(e) => e.key === "Enter" && addDefaultContentType()}
									/>
								</td>
								<td>
									<button
										type="button"
										class="btn w-full {primary}"
										disabled={!canAddContentType}
										on:click={addDefaultContentType}>Add</button
									>
								</td>
							</tr>
						</tfoot>
					</table>
				</div>
			{:else if section === "browser"}
				<h3 class="text-xl font-bold">Browser</h3>
				<p class="mb-4 text-sm opacity-70">Chrome that Marasi starts with the proxy configured.</p>
				<div class="table-container mb-6">
					<table class="table">
						<thead>
							<tr>
								<th>Chrome Path</th>
								<th class="w-44">OS</th>
								<th class="w-44"></th>
							</tr>
						</thead>
						<tbody>
							{#each chromePaths as path}
								<tr>
									<td class="font-mono">{path.Path}</td>
									<td>{path.OS}</td>
									<td class="text-center">
										<button
											type="button"
											class={iconButton}
											title="Delete"
											on:click={() => deleteChromePath(path)}><X size={15} /></button
										>
									</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<td>
									<input
										type="text"
										placeholder="Enter Chrome Path (e.g. /usr/bin/google-chrome)"
										class={tableField}
										bind:value={selectedPath}
									/>
								</td>
								<td>
									<select class={tableField} bind:value={selectedOS}>
										<option value="">Select OS</option>
										<option value="windows">windows</option>
										<option value="darwin">darwin</option>
										<option value="linux">linux</option>
									</select>
								</td>
								<td>
									<button
										type="button"
										class="btn w-full {primary}"
										disabled={selectedOS === "" || selectedPath === ""}
										on:click={addChromePath}>Add Path</button
									>
								</td>
							</tr>
						</tfoot>
					</table>
				</div>
				<div class="table-container">
					<table class="table">
						<thead>
							<tr>
								<th>Chrome Profile</th>
								<th class="w-44"></th>
							</tr>
						</thead>
						<tbody>
							{#each chromeProfiles as profile}
								<tr>
									<td>{profile}</td>
									<td class="text-center">
										<button
											type="button"
											class={iconButton}
											title="Delete"
											on:click={() => deleteChromeProfile(profile)}><X size={15} /></button
										>
									</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<td>
									<input
										type="text"
										placeholder="Enter profile name"
										class={tableField}
										bind:value={selectedProfile}
									/>
								</td>
								<td>
									<button
										type="button"
										class="btn w-full {primary}"
										disabled={selectedProfile === ""}
										on:click={addChromeProfile}>Add Profile</button
									>
								</td>
							</tr>
						</tfoot>
					</table>
				</div>
			{:else if section === "highlights"}
				<div class="flex items-baseline justify-between gap-4">
					<h3 class="text-xl font-bold">Highlights</h3>
					<button
						type="button"
						class="btn btn-sm variant-soft"
						on:click={confirmResetHighlights}>Reset to defaults</button
					>
				</div>
				<p class="text-sm opacity-70">
					Colours apply to every project. An empty label shows the colour's name. A
					project can set its own label from the Ledger.
				</p>
				{#each $highlightPalette as highlight (highlight.number)}
					<div class={row} data-highlight={highlight.number}>
						<div class="flex items-center gap-3">
							<span
								class="h-4 w-4 shrink-0 rounded-sm"
								style="background-color: {highlight.color}"
							></span>
							<div>
								<p>Highlight {highlight.number}</p>
								<p class="text-sm opacity-70">{highlight.appLabel ?? highlight.name}</p>
							</div>
						</div>
						<div class="{control} items-center gap-2">
							<input
								type="color"
								class="h-9 w-12 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
								aria-label="Highlight {highlight.number} colour"
								value={highlight.color}
								on:change={(event) =>
									saveHighlight(highlight.number, { color: event.currentTarget.value })}
							/>
							<input
								class="input w-full"
								type="text"
								aria-label="Highlight {highlight.number} label"
								placeholder={highlight.name}
								value={highlight.appLabel ?? ""}
								on:change={(event) =>
									saveHighlight(highlight.number, { label: event.currentTarget.value })}
							/>
						</div>
					</div>
				{/each}
			{:else}
				<h3 class="text-xl font-bold">About</h3>
				<div class={row}>
					<p>Version</p>
					<p class="{control} font-mono text-sm">{buildInfo?.Version ?? "…"}</p>
				</div>
				<div class={row}>
					<p>Channel</p>
					<p class="{control} font-mono text-sm">{buildInfo?.Channel ?? "…"}</p>
				</div>
			{/if}
		</section>
	</div>
</div>
