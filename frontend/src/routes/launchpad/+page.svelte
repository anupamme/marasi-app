<script>
    // Launchpad: a resizable dock with the launchpad file tree, and the
    // workspace with the Launchpad draft and response side by side. State
    // and API calls live in launchpadStore; this page wires confirmations,
    // toasts and the existing launchpad.* catalog actions.
    import { getModalStore, getToastStore } from "@skeletonlabs/skeleton";
    import {
        ArrowDownIcon,
        ArrowDownToLineIcon,
        ArrowLeftIcon,
        ArrowLeftRightIcon,
        ArrowRightIcon,
        BracesIcon,
        Columns2Icon,
        FolderTreeIcon,
        GitCompareIcon,
        LockIcon,
        PanelLeftIcon,
        PenIcon,
        PenLineIcon,
        PlayIcon,
        PlusIcon,
        SearchIcon,
        TrashIcon,
    } from "lucide-svelte";
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { page } from "$app/stores";
    import MarasiKeys from "../../lib/components/MarasiMenu/MarasiKeys.svelte";
    import { useMenuActions } from "../../lib/keybindings/app.js";
    import LaunchpadDock from "../../lib/launchpad/LaunchpadDock.svelte";
    import LaunchpadTree from "../../lib/launchpad/LaunchpadTree.svelte";
    import LaunchpadWorkspace from "../../lib/launchpad/LaunchpadWorkspace.svelte";
    import { compareClick, compareEscape } from "../../lib/launchpad/compare.js";
    import { latestEntry } from "../../lib/launchpad/jumpTarget.js";
    import { GetMetadata, GetNote } from "../../lib/wailsjs/go/main/App";
    import { listener } from "../../stores";
    import { isDraftDirty, launchpadStore } from "../../stores/launchpadStore";

    const modalStore = getModalStore();
    const toastStore = getToastStore();

    let dock;
    let tree;
    let workspace;
    let searchInput;
    let groupByStatus;

    onMount(async () => {
        await launchpadStore.populate();
        const urlID = $page.url.searchParams.get("id");
        if (urlID && get(launchpadStore).launchpads.some((l) => l.ID === urlID)) {
            await launchpadStore.selectLaunchpad(urlID);
        }
        // Counts and last statuses in the tree need every entry list.
        await launchpadStore.loadAllEntries();
    });

    function confirm(title, body, onConfirm) {
        modalStore.trigger({
            type: "confirm",
            title,
            body,
            response: (ok) => ok && onConfirm(),
        });
    }

    async function pickEntry(launchpadId, entryId) {
        // While comparing, a click on the compared launchpad fills a side.
        const side = compareClick(get(launchpadStore), launchpadId, entryId);
        if (side === "ignore") return;
        if (side) return launchpadStore.setCompareSide(side, entryId);
        const { needsConfirm } = await launchpadStore.selectEntry(launchpadId, entryId);
        if (!needsConfirm) return;
        confirm(
            "Discard the draft?",
            "This launchpad's draft has unsaved edits. Loading another entry replaces them.",
            () => launchpadStore.selectEntry(launchpadId, entryId, { force: true }),
        );
    }

    // ⌘⇧↓ selects the open launchpad's newest entry through the usual
    // draft guard. While that launchpad is compared, it only scrolls, so A
    // and B stay as picked.
    async function jumpToLatest() {
        const state = get(launchpadStore);
        const latest = latestEntry(state);
        if (!latest) return;
        if (state.compare?.launchpadId !== latest.launchpadId) await pickEntry(latest.launchpadId, latest.entryId);
        await tree?.showEntry(latest.launchpadId, latest.entryId);
    }

    // Esc cancels a chip re-pick, then closes compare. Editors, inputs and
    // open modals keep their own Esc (vim mode uses it).
    function onKeydown(event) {
        if (event.key !== "Escape" || event.defaultPrevented || $modalStore.length) return;
        if (event.target?.closest?.("input, textarea, select, .cm-editor")) return;
        const action = compareEscape(get(launchpadStore));
        if (!action) return;
        event.preventDefault();
        if (action === "stop-picking") launchpadStore.pickCompareSide(null);
        else launchpadStore.closeCompare();
    }

    function deleteLaunchpad() {
        const state = get(launchpadStore);
        const launchpad = state.launchpads.find((l) => l.ID === state.selectedLaunchpadId);
        if (!launchpad) return;
        confirm(
            `Delete ${launchpad.Name}?`,
            isDraftDirty(state, launchpad.ID) ? "Its unsaved draft will be discarded." : undefined,
            () => launchpadStore.deleteLaunchpad(launchpad.ID),
        );
    }

    async function launch() {
        const id = get(launchpadStore).selectedLaunchpadId;
        if (!id) return;
        if (!$listener.status) {
            toastStore.trigger({
                message: "Listener is offline.",
                background: "variant-filled-error",
            });
            return;
        }
        try {
            // The launched entry arrives through the layout's request event
            // and the store selects it.
            await launchpadStore.launch(id);
            toastStore.trigger({
                message: "Request launched",
                background: "variant-filled-success",
            });
        } catch (err) {
            console.error("Launchpad error:", err);
            toastStore.trigger({
                message: "Failed to launch the request",
                background: "variant-filled-error",
            });
        }
    }

    function stepLaunchpad(direction) {
        const { launchpads, selectedLaunchpadId } = get(launchpadStore);
        const index = launchpads.findIndex((l) => l.ID === selectedLaunchpadId);
        const next = launchpads[index + direction];
        if (next) launchpadStore.selectLaunchpad(next.ID);
    }

    function stepEntry(direction) {
        const state = get(launchpadStore);
        const id = state.selectedLaunchpadId;
        const entries = state.entriesByLaunchpad[id] || [];
        // While comparing, stepping moves B (pickEntry routes the click).
        const from =
            state.compare?.launchpadId === id && state.compare.rightId
                ? state.compare.rightId
                : state.selectedEntryByLaunchpad[id];
        const index = entries.findIndex((e) => e.ID === from);
        const next = entries[index + direction];
        if (next) pickEntry(id, next.ID);
    }

    function selectedEntry() {
        const state = get(launchpadStore);
        const id = state.selectedLaunchpadId;
        const entries = state.entriesByLaunchpad[id] || [];
        const index = entries.findIndex((e) => e.ID === state.selectedEntryByLaunchpad[id]);
        return index < 0 ? null : { entry: entries[index], number: index + 1 };
    }

    function toggleEntryModal(component, actionId, fetch, title) {
        const selected = selectedEntry();
        if (!selected) return;
        fetch(selected.entry.ID).then((content) => {
            if (!$modalStore[0]) {
                modalStore.trigger({
                    type: "component",
                    component,
                    toggleAction: actionId,
                    title: `Entry ${selected.number} ${title}`,
                    content,
                    requestID: selected.entry.ID,
                });
            } else if ($modalStore[0].component === component) {
                modalStore.close();
            }
        });
    }

    // The sidebar opens first so the tree's search box and new-launchpad
    // field are on screen when they take focus.
    async function createLaunchpad() {
        await dock?.expand();
        tree?.startCreate();
    }

    // Swapping needs both sides picked.
    function swapCompare() {
        const { compare } = get(launchpadStore);
        if (compare?.leftId && compare.rightId) launchpadStore.swapCompare();
    }

    // Catalog actions keep their pre-redesign IDs (ADR-0001):
    // toggle-settings renames, *-tab steps launchpads.
    const launchpadMenu = [
        { actionId: "launchpad.focus-search", icon: SearchIcon, handler: () => dock?.expand(true) },
        { actionId: "launchpad.create", icon: PlusIcon, handler: createLaunchpad },
        {
            actionId: "launchpad.toggle-settings",
            icon: PenLineIcon,
            handler: () => workspace?.toggleEdit(),
        },
        { actionId: "launchpad.toggle-sidebar", icon: PanelLeftIcon, handler: () => dock?.toggle() },
        {
            actionId: "launchpad.toggle-group-by-status",
            icon: FolderTreeIcon,
            handler: () => (groupByStatus = !groupByStatus),
        },
        { actionId: "launchpad.jump-to-latest", icon: ArrowDownToLineIcon, handler: jumpToLatest },
        { actionId: "launchpad.toggle-compare", icon: GitCompareIcon, handler: () => workspace?.toggleCompare() },
        {
            actionId: "launchpad.toggle-compare-view",
            icon: Columns2Icon,
            handler: () => workspace?.toggleCompareView(),
        },
        { actionId: "launchpad.swap-compare", icon: ArrowLeftRightIcon, handler: swapCompare },
        { actionId: "launchpad.next-tab", icon: ArrowRightIcon, handler: () => stepLaunchpad(1) },
        { actionId: "launchpad.previous-tab", icon: ArrowLeftIcon, handler: () => stepLaunchpad(-1) },
        { actionId: "launchpad.next-entry", icon: ArrowDownIcon, handler: () => stepEntry(1) },
        { actionId: "launchpad.previous-entry", icon: ArrowDownIcon, handler: () => stepEntry(-1) },
        { actionId: "launchpad.delete-tab", icon: TrashIcon, handler: deleteLaunchpad },
        {
            actionId: "launchpad.edit-request",
            icon: PenIcon,
            handler: () => document.querySelector(".lp-editor .cm-content")?.focus(),
        },
        {
            actionId: "launchpad.toggle-tls",
            icon: LockIcon,
            handler: () => {
                const state = get(launchpadStore);
                const id = state.selectedLaunchpadId;
                if (id) launchpadStore.setUseHttps(id, !(state.draftsByLaunchpad[id]?.useHttps ?? true));
            },
        },
        { actionId: "launchpad.launch", icon: PlayIcon, handler: launch },
        {
            actionId: "launchpad.view-notes",
            icon: PenIcon,
            handler: () => toggleEntryModal("Notes", "launchpad.view-notes", GetNote, "Notes"),
        },
        {
            actionId: "launchpad.view-metadata",
            icon: BracesIcon,
            handler: () => toggleEntryModal("Metadata", "launchpad.view-metadata", GetMetadata, "Metadata"),
        },
    ];
    useMenuActions(launchpadMenu);
</script>

<svelte:window on:keydown={onKeydown} />
<MarasiKeys menuOptions={launchpadMenu} />

<div class="relative flex h-full min-h-0">
    <LaunchpadDock bind:this={dock} store={launchpadStore} {searchInput}>
        <LaunchpadTree
            bind:this={tree}
            bind:groupByStatus
            store={launchpadStore}
            pickLaunchpad={(id) => launchpadStore.selectLaunchpad(id)}
            {pickEntry}
            bind:searchInput
        />
    </LaunchpadDock>
    <div class="min-w-0 flex-1">
        <LaunchpadWorkspace
            bind:this={workspace}
            store={launchpadStore}
            onEditorFocus={() => dock?.onEditorFocus()}
            onLaunch={launch}
            onDelete={deleteLaunchpad}
            launchDisabled={!$listener.status}
        />
    </div>
</div>
