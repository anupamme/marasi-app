// Operations shared by the global menu actions and the dashboard buttons.
import { goto } from "$app/navigation";
import { get } from "svelte/store";
import {
	OpenProject,
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
 * events (see lib/openProgress.js).
 */
export async function openProjectFile(r, toastStore) {
	lastOpen = { r, toastStore };
	const parts = String(r).split(/[\\/]/);
	const projectName = parts.pop().replace(/\.marasi$/, "");
	startOpening({
		name: projectName,
		// A bare name (a new project) has no path until its database opens.
		path: parts.length > 0 ? String(r) : null,
		currentProject: get(activeProject),
	});
	appState.update((s) => ({ ...s, isReady: false }));
	const showTimer = setTimeout(showOpening, openingDelay);
	let name;
	try {
		name = await OpenProject(r);
	} catch (repoError) {
		clearTimeout(showTimer);
		appState.update((s) => ({ ...s, isReady: true }));
		// Cancelled at the unsaved-work prompt: nothing to show.
		if (String(repoError).includes("project switch cancelled")) {
			clearOpening();
			return;
		}
		failOpening(repoError);
		return;
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
		return;
	} finally {
		// The pages mount afresh on the new project's stores.
		pagesKey.update((key) => key + 1);
		appState.update((s) => ({ ...s, isReady: true }));
	}
	clearTimeout(showTimer);
	finishOpening();
	toastStore.trigger({
		message: "Opened " + name + " project",
		background: "variant-filled-success",
	});
}

/** Re-runs the last open, for the opening screen's Try again. */
export function retryOpen() {
	if (lastOpen) openProjectFile(lastOpen.r, lastOpen.toastStore);
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
