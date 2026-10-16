<script>
	import { activeProject } from "../../stores";
	import { CountNotes, GetScopeRules } from "../wailsjs/go/main/App";
	import {
		Edit2Icon,
		SendIcon,
		FlagIcon,
		ActivityIcon,
		CheckCircleIcon,
		XCircleIcon,
	} from "svelte-feather-icons";
	import {
		BookCheck,
		Shield,
		ShieldAlert,
		ShieldOff,
	} from "lucide-svelte";
	import { findingStore } from "../../stores/findingStore";
	import { testCaseStore } from "../../stores/testCaseStore";

	// Dashboard statistics
	let totalRequests = 0;
	let notes = 0;
	let launchpads = 0;
	let intercepted = 0;

	// Scope statistics
	let defaultAllow = true;
	let includeRulesCount = 0;
	let excludeRulesCount = 0;

	$: testCasesCount = $testCaseStore.length;
	$: findingsCount = $findingStore.length;
	$: criticalCount = $findingStore.filter(
		(f) => f.Severity === "Critical",
	).length;
	$: highCount = $findingStore.filter(
		(f) => f.Severity === "High",
	).length;

	// Refreshes on mount and on each project switch. (A second refresh in
	// onMount doubled CountNotes, which holds up every other call to Marasi
	// while it counts a large project.)
	$: if ($activeProject) {
		refreshDashboard();
	}

	// While a figure is read its card shows a ghost bar instead; a newer
	// refresh (a project switch) wins over a slower older one.
	let countsLoading = true;
	let scopeLoading = true;
	let refreshes = 0;
	const ghost =
		"dashboard-ghost inline-block h-7 w-16 animate-pulse rounded-sm bg-surface-300 align-middle dark:bg-surface-600";

	// Refresh dashboard data
	function refreshDashboard() {
		const run = ++refreshes;
		countsLoading = true;
		scopeLoading = true;
		CountNotes()
			.then((dashboard) => {
				if (run !== refreshes) return;
				totalRequests = dashboard.Requests;
				notes = dashboard.Notes;
				launchpads = dashboard.Launchpads;
				intercepted = dashboard.Interceptions || 0;
			})
			.catch((err) => console.error("Counting the dashboard failed:", err))
			.finally(() => {
				if (run === refreshes) countsLoading = false;
			});

		GetScopeRules()
			.then((scopeData) => {
				if (run !== refreshes) return;
				defaultAllow = scopeData.defaultAllow;
				includeRulesCount = scopeData.includeRules.length;
				excludeRulesCount = scopeData.excludeRules.length;
			})
			.catch((err) => console.error("Reading the scope rules failed:", err))
			.finally(() => {
				if (run === refreshes) scopeLoading = false;
			});
	}

</script>

<div class="no-select p-4">
	<h2 class="text-2xl font-bold mb-6">
		{$activeProject} Project Dashboard
	</h2>

	<!-- Main metrics cards -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
		<!-- Total Requests -->
		<div
			class="card bg-surface-100-500-token text-surface-900-50-token border-l-4"
			style="border-color: rgb(var(--color-primary-700))"
		>
			<div class="card-body p-4">
				<div class="flex items-center">
					<div
						class="rounded-full p-3"
						style="background-color: rgb(var(--color-primary-700)); color: rgb(var(--color-primary-200))"
					>
						<ActivityIcon size="24" />
					</div>
					<div class="ml-4">
						<p class="text-sm opacity-70">
							Total Requests
						</p>
						<p class="text-3xl font-bold">
							{#if countsLoading}<span class={ghost}></span>{:else}{totalRequests}{/if}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Notes -->
		<div
			class="card bg-surface-100-500-token text-surface-900-50-token border-l-4"
			style="border-color: rgb(var(--color-tertiary-700))"
		>
			<div class="card-body p-4">
				<div class="flex items-center">
					<div
						class="rounded-full p-3"
						style="background-color: rgb(var(--color-tertiary-700)); color: rgb(var(--color-tertiary-200))"
					>
						<Edit2Icon size="24" />
					</div>
					<div class="ml-4">
						<p class="text-sm opacity-70">
							Notes
						</p>
						<p class="text-3xl font-bold">
							{#if countsLoading}<span class={ghost}></span>{:else}{notes}{/if}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Launchpads -->
		<div
			class="card bg-surface-100-500-token text-surface-900-50-token border-l-4"
			style="border-color: rgb(var(--color-surface-700))"
		>
			<div class="card-body p-4">
				<div class="flex items-center">
					<div
						class="rounded-full p-3"
						style="background-color: rgb(var(--color-surface-700)); color: rgb(var(--color-surface-300))"
					>
						<SendIcon size="24" />
					</div>
					<div class="ml-4">
						<p class="text-sm opacity-70">
							Launchpads
						</p>
						<p class="text-3xl font-bold">
							{#if countsLoading}<span class={ghost}></span>{:else}{launchpads}{/if}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Intercepted -->
		<div
			class="card bg-surface-100-500-token text-surface-900-50-token border-l-4"
			style="border-color: rgb(var(--color-warning-700))"
		>
			<div class="card-body p-4">
				<div class="flex items-center">
					<div
						class="rounded-full p-3"
						style="background-color: rgb(var(--color-warning-700)); color: rgb(var(--color-warning-200))"
					>
						<FlagIcon size="24" />
					</div>
					<div class="ml-4">
						<p class="text-sm opacity-70">
							Intercepted
						</p>
						<p class="text-3xl font-bold">
							{#if countsLoading}<span class={ghost}></span>{:else}{intercepted}{/if}
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<h2 class="text-2xl font-bold mb-6">Reporting</h2>
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
		<div
			class="card bg-surface-100-500-token text-surface-900-50-token border-l-4"
			style="border-color: rgb(var(--color-tertiary-500))"
		>
			<div class="card-body p-4">
				<div class="flex items-center">
					<div
						class="rounded-full p-3"
						style="background-color: rgb(var(--color-tertiary-700)); color: rgb(var(--color-tertiary-100))"
					>
						<BookCheck size="24" />
					</div>
					<div class="ml-4">
						<p class="text-sm opacity-70">
							Test Cases
						</p>
						<p class="text-3xl font-bold">
							{testCasesCount}
						</p>
					</div>
				</div>
			</div>
		</div>

		<div
			class="card bg-surface-100-500-token text-surface-900-50-token border-l-4"
			style="border-color: rgb(var(--color-primary-500))"
		>
			<div class="card-body p-4">
				<div class="flex items-center">
					<div
						class="rounded-full p-3"
						style="background-color: rgb(var(--color-primary-700)); color: rgb(var(--color-primary-100))"
					>
						<ShieldAlert size="24" />
					</div>
					<div class="ml-4">
						<p class="text-sm opacity-70">
							Findings
						</p>
						<p class="text-3xl font-bold">
							{findingsCount}
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<h2 class="text-2xl font-bold mb-6">Scope</h2>
	<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
		<!-- Default Policy -->
		<div
			class="card bg-surface-100-500-token text-surface-900-50-token border-l-4"
			style="border-color: rgb(var(--color-success-700))"
		>
			<div class="card-body p-4">
				<div class="flex items-center">
					<div
						class="rounded-full p-3"
						style="background-color: rgb(var(--color-success-700)); color: rgb(var(--color-success-200))"
					>
						{#if !defaultAllow}
							<Shield size="24" />
						{:else}
							<ShieldOff size="24" />
						{/if}
					</div>
					<div class="ml-4">
						<p class="text-sm opacity-70">
							Default Policy
						</p>
						<p class="text-3xl font-bold">
							{#if scopeLoading}<span class={ghost}></span>{:else}{defaultAllow
									? "Allow"
									: "Deny"}{/if}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Include Rules -->
		<div
			class="card bg-surface-100-500-token text-surface-900-50-token border-l-4"
			style="border-color: rgb(var(--color-secondary-700))"
		>
			<div class="card-body p-4">
				<div class="flex items-center">
					<div
						class="rounded-full p-3"
						style="background-color: rgb(var(--color-secondary-700)); color: rgb(var(--color-surface-800))"
					>
						<CheckCircleIcon size="24" />
					</div>
					<div class="ml-4">
						<p class="text-sm opacity-70">
							Include Rules
						</p>
						<p class="text-3xl font-bold">
							{#if scopeLoading}<span class={ghost}></span>{:else}{includeRulesCount}{/if}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Exclude Rules -->
		<div
			class="card bg-surface-100-500-token text-surface-900-50-token border-l-4"
			style="border-color: rgb(var(--color-primary-700))"
		>
			<div class="card-body p-4">
				<div class="flex items-center">
					<div
						class="rounded-full p-3"
						style="background-color: rgb(var(--color-primary-700)); color: rgb(var(--color-error-200))"
					>
						<XCircleIcon size="24" />
					</div>
					<div class="ml-4">
						<p class="text-sm opacity-70">
							Exclude Rules
						</p>
						<p class="text-3xl font-bold">
							{#if scopeLoading}<span class={ghost}></span>{:else}{excludeRulesCount}{/if}
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
