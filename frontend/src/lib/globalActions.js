// Operations shared by the global menu actions and the dashboard buttons.
import { goto } from "$app/navigation";
import { get } from "svelte/store";
import {
	OpenProject,
	SetupScratchpad,
	StartProxy,
	UpdateProxy,
	DownloadCert,
	CopyCertToClipboard,
} from "./wailsjs/go/main/App";
import { WindowSetTitle } from "./wailsjs/runtime/runtime";
import {
	activeProject,
	appState,
	clearOpening,
	failOpening,
	finishOpening,
	listener,
	openProject,
	pagesKey,
	showOpening,
	startOpening,
	switchOpening,
} from "../stores.js";

export function setupListener(r, toastStore) {
	const active = get(listener).status;
	const apply = active ? UpdateProxy : StartProxy;
	apply(r.addr, r.port)
		.then(() => {
			listener.set({
				status: true,
				address: r.addr,
				port: r.port,
			});
			toastStore.trigger({
				message: "Listening on " + r.addr + ":" + r.port,
				background: "variant-filled-success",
			});
		})
		.catch(() => {
			if (!active) {
				listener.set({
					status: false,
					address: r.addr,
					port: r.port,
				});
			}
			toastStore.trigger({
				message: "Failed to setup listener on " + r.addr + ":" + r.port,
				background: "variant-filled-error",
			});
		});
}

// The opening screen waits this long before it shows an open in progress,
// so quick switches stay instant.
const openingDelay = 300;
// The last open asked for, which the opening screen's Try again re-runs.
let lastOpen = null;

/**
 * Opens the project `r` (a full path, or a bare name for a project in the
 * config dir) and loads it. The opening screen shows the whole open, Go's
 * open and the load, if it takes longer than openingDelay, and always when
 * it fails. The open project and the app's pages stay as they were unless
 * the target's database opens. The layout feeds the screen the open's log
 * events (see lib/openProgress.js). Resolves to the project that opened,
 * `{name, path}`, or null.
 */
export function openProjectFile(r, toastStore) {
	lastOpen = () => openProjectFile(r, toastStore);
	const parts = String(r).split(/[\\/]/);
	return openWithScreen({
		name: parts.pop().replace(/\.marasi$/, ""),
		// A bare name (a new project) has no path until its database opens.
		path: parts.length > 0 ? String(r) : null,
		open: () => OpenProject(r),
		toastStore,
	});
}

/**
 * Opens the scratchpad at startup, with the opening screen up from the
 * start, as nothing is open yet. Resolves like openProjectFile.
 */
export function openScratchpad() {
	lastOpen = openScratchpad;
	const name = "scratchpad";
	return openWithScreen({
		name,
		scratchpad: true,
		open: () => SetupScratchpad().then(() => name),
	});
}

// Runs `open` (Go's open, resolving to the project's name) and loads the
// project, with the opening screen for `name` at `path`. A toastStore
// announces the open.
async function openWithScreen({ name: target, path = null, scratchpad = false, open, toastStore = null }) {
	// Before the first project has loaded, nothing is open to stay in.
	const currentProject = get(appState).started ? get(activeProject) : null;
	startOpening({ name: target, path, currentProject, scratchpad });
	appState.update((s) => ({ ...s, isReady: false }));
	// With nothing open there's nothing else to show, so the screen is up at once.
	if (currentProject === null) showOpening();
	const showTimer = setTimeout(showOpening, openingDelay);
	let name;
	try {
		name = await open();
	} catch (repoError) {
		clearTimeout(showTimer);
		appState.update((s) => ({ ...s, isReady: true }));
		// Cancelled at the unsaved-work prompt: nothing to show.
		if (String(repoError).includes("project switch cancelled")) {
			clearOpening();
			return null;
		}
		failOpening(repoError);
		return null;
	}
	switchOpening();
	activeProject.set(name);
	WindowSetTitle(name);
	goto("/");
	try {
		await openProject();
	} catch (loadError) {
		clearTimeout(showTimer);
		failOpening(loadError);
		return null;
	} finally {
		// The pages mount afresh on the new project's stores.
		pagesKey.update((key) => key + 1);
		appState.update((s) => ({ ...s, isReady: true }));
	}
	clearTimeout(showTimer);
	const opened = finishOpening();
	toastStore?.trigger({
		message: "Opened " + name + " project",
		background: "variant-filled-success",
	});
	return opened;
}

/**
 * Re-runs the last open, for the opening screen's Try again: at startup,
 * the scratchpad until a project is picked.
 */
export function retryOpen() {
	lastOpen?.();
}

export function projectModal(toastStore) {
	return {
		type: "component",
		component: "Project",
		toggleAction: "global.open-project",
		title: "Switch Projects",
		response: (r) => {
			if (r) openProjectFile(r, toastStore);
		},
	};
}

export function listenerModal(toastStore) {
	return {
		type: "component",
		component: "Interface",
		toggleAction: "global.setup-listener",
		title: "Setup Listener",
		response: (r) => {
			if (r) setupListener(r, toastStore);
		},
	};
}

export async function downloadCertificate(toastStore) {
	try {
		const saved = await DownloadCert();
		if (saved) {
			toastStore.trigger({
				message: "Certificate saved successfully",
				background: "variant-filled-success",
			});
		}
	} catch (err) {
		toastStore.trigger({
			message: "Failed to save certificate: " + err,
			background: "variant-filled-error",
		});
	}
}

export async function copyCertificate(toastStore) {
	try {
		const copied = await CopyCertToClipboard();
		if (copied) {
			toastStore.trigger({
				message: "Certificate copied to clipboard",
				background: "variant-filled-success",
			});
		}
	} catch (err) {
		toastStore.trigger({
			message: "Failed to copy certificate: " + err,
			background: "variant-filled-error",
		});
	}
}

// chromeError returns a rejection handler for the Chrome bindings. They
// reread the machine config, so a config Marasi refuses (for example a
// negative websocket_max_message_size) arrives as its "invalid
// configuration" error, which is shown as is; anything else shows fallback.
export function chromeError(toastStore, fallback) {
	return (error) => {
		const text = String(error);
		toastStore.trigger({
			message: text.includes("invalid configuration") ? text : fallback,
			background: "variant-filled-error",
		});
	};
}
