<script>
    import {
        Accordion,
        AccordionItem,
        getModalStore,
        getToastStore,
        ProgressRadial,
        SlideToggle,
        modeCurrent,
    } from "@skeletonlabs/skeleton";
    import MarasiKeys from "../../lib/components/MarasiMenu/MarasiKeys.svelte";
    import { useMenuActions } from "../../lib/keybindings/app.js";
    import {
        ArrowDownIcon,
        ArrowLeftIcon,
        ArrowRightIcon,
        BracesIcon,
        ChevronLeftIcon,
        ChevronRightIcon,
        LockIcon,
        PenIcon,
        PlayIcon,
        SendIcon,
        SettingsIcon,
        ToggleLeftIcon,
        TrashIcon,
    } from "lucide-svelte";
    import { page } from "$app/stores";
    import { beforeNavigate, goto } from "$app/navigation";
    import { listener } from "../../stores";
    import { isDraftDirty, launchpadStore } from "../../stores/launchpadStore";
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import RequestResponseView from "../../lib/components/RequestResponseView.svelte";
    import { GetMetadata, GetNote } from "../../lib/wailsjs/go/main/App";
    const modalStore = getModalStore();
    const toastStore = getToastStore();
    let accOpened = false;
    let isSending = false;

    // Everything below reads launchpadStore; this page keeps only the
    // editor binding. Ticket 02 replaces this page with the tree sidebar.
    $: launchpads = $launchpadStore.launchpads;
    $: activeLaunchpadId = $launchpadStore.selectedLaunchpadId;
    $: activeLaunchpad = launchpads.find(
        (launchpad) => launchpad.ID === activeLaunchpadId,
    );
    $: currentLaunchpadIndex = launchpads.findIndex(
        (launchpad) => launchpad.ID === activeLaunchpadId,
    );
    $: activeEntries = $launchpadStore.entriesByLaunchpad[activeLaunchpadId] || [];
    $: selectedEntryId = $launchpadStore.selectedEntryByLaunchpad[activeLaunchpadId];
    $: currentEntryIndex = activeEntries.findIndex(
        (entry) => entry.ID === selectedEntryId,
    );
    $: currentEntry = activeEntries[currentEntryIndex] || {};
    $: draft = $launchpadStore.draftsByLaunchpad[activeLaunchpadId];

    // Read the store directly: syncDraft writes it from inside a reactive
    // statement, and Svelte 4 does not re-run this component's reactive
    // statements for that write, so a `$:` dirty flag would go stale.
    function isDirty() {
        return isDraftDirty(get(launchpadStore), activeLaunchpadId);
    }

    // The editor remounts per entry and reports edits back here; they flow
    // into the launchpad's draft. A dirty draft is handed to the new editor
    // as already edited, so the editor does not overwrite it.
    let editorBody = "";
    let editorEdited = false;
    $: editorKey = `${activeLaunchpadId}:${currentEntry.ID}`;
    $: resetEditor(editorKey);
    function resetEditor() {
        const dirty = isDirty();
        editorEdited = dirty;
        editorBody = dirty
            ? get(launchpadStore).draftsByLaunchpad[activeLaunchpadId].raw
            : "";
    }
    $: syncDraft(editorBody, editorEdited);
    function syncDraft(body, edited) {
        if (!activeLaunchpadId || !draft) return;
        if (edited) launchpadStore.updateDraft(activeLaunchpadId, body);
        else if (isDirty()) launchpadStore.revertDraft(activeLaunchpadId);
    }

    function confirmDiscard(onConfirm) {
        if (!isDirty()) {
            onConfirm();
            return;
        }
        modalStore.trigger({
            type: "confirm",
            title: "Confirm Action",
            body: "You have made changes to the text. Navigating away will clear your changes. Continue?",
            response: (result) => {
                if (result) {
                    launchpadStore.revertDraft(activeLaunchpadId);
                    onConfirm();
                }
            },
        });
    }

    function navLaunchpad(dir) {
        const next = launchpads[currentLaunchpadIndex + dir];
        if (next) confirmDiscard(() => launchpadStore.selectLaunchpad(next.ID));
    }

    function navEntry(dir) {
        const next = activeEntries[currentEntryIndex + dir];
        if (!next) return;
        const launchpadId = activeLaunchpadId;
        launchpadStore.selectEntry(launchpadId, next.ID).then(({ needsConfirm }) => {
            if (!needsConfirm) return;
            confirmDiscard(() =>
                launchpadStore.selectEntry(launchpadId, next.ID, { force: true }),
            );
        });
    }

    beforeNavigate(({ to, cancel }) => {
        if (!isDirty()) return;
        cancel();
        confirmDiscard(() => {
            if (to) goto(to.url.pathname + to.url.search);
        });
    });

    async function sendRequest() {
        if (!draft || !activeLaunchpadId) return;

        if (!$listener.status) {
            toastStore.trigger({
                message: "Listener is offline.",
                background: "variant-filled-error",
            });
            return;
        }

        if (isSending) return;

        try {
            isSending = true;
            // The launched entry arrives through the layout's request event
            // and the store selects it.
            await launchpadStore.launch(activeLaunchpadId);
            toastStore.trigger({
                message: "Request launched",
                background: "variant-filled-success",
            });
        } catch (err) {
            console.error("Launchpad error:", err);
            toastStore.trigger({
                message: "Failed to send request",
                background: "variant-filled-error",
            });
        } finally {
            isSending = false;
        }
    }

    function setUseHttps(useHttps) {
        if (activeLaunchpadId) launchpadStore.setUseHttps(activeLaunchpadId, useHttps);
    }

    onMount(async () => {
        await launchpadStore.populate();

        const urlID = $page.url.searchParams.get("id");
        if (urlID && $launchpadStore.launchpads.some((l) => l.ID === urlID)) {
            await launchpadStore.selectLaunchpad(urlID);
        }
    });

    const launchpadMenu = [
        {
            actionId: "launchpad.toggle-settings",
            icon: ToggleLeftIcon,
            handler: () => (accOpened = !accOpened),
        },
        {
            actionId: "launchpad.next-tab",
            icon: ArrowRightIcon,
            handler: () => navLaunchpad(1),
        },
        {
            actionId: "launchpad.previous-tab",
            icon: ArrowLeftIcon,
            handler: () => navLaunchpad(-1),
        },
        {
            actionId: "launchpad.next-entry",
            icon: ArrowDownIcon,
            handler: () => navEntry(1),
        },
        {
            actionId: "launchpad.previous-entry",
            icon: ArrowDownIcon,
            handler: () => navEntry(-1),
        },
        {
            actionId: "launchpad.delete-tab",
            icon: TrashIcon,
            handler: () => {
                if (!activeLaunchpad) return;
                modalStore.trigger({
                    type: "confirm",
                    title: `Deleting ${activeLaunchpad.Name}`,
                    body: "Are you sure you wish to proceed?",
                    response: (r) => {
                        if (r) {
                            launchpadStore.deleteLaunchpad(activeLaunchpad.ID);
                        }
                    },
                });
            },
        },
        {
            actionId: "launchpad.edit-request",
            icon: PenIcon,
            handler: () => {
                const cmContent = document.querySelector(
                    'div[data-language="http"]',
                );
                if (cmContent) cmContent.focus();
            },
        },
        {
            actionId: "launchpad.toggle-tls",
            icon: LockIcon,
            handler: () => setUseHttps(!(draft?.useHttps ?? true)),
        },
        {
            actionId: "launchpad.launch",
            icon: PlayIcon,
            handler: sendRequest,
        },
        {
            actionId: "launchpad.view-notes",
            icon: PenIcon,
            handler: () => {
                if (!currentEntry?.ID) return;
                GetNote(currentEntry.ID).then((note) => {
                    const modal = {
                        type: "component",
                        component: "Notes",
                        toggleAction: "launchpad.view-notes",
                        title: `Request ${currentEntryIndex + 1} Notes`,
                        content: note,
                        requestID: currentEntry.ID,
                    };
                    if (!$modalStore[0]) {
                        modalStore.trigger(modal);
                    } else if ($modalStore[0].component === "Notes") {
                        modalStore.close();
                    }
                });
            },
        },
        {
            actionId: "launchpad.view-metadata",
            icon: BracesIcon,
            handler: () => {
                if (!currentEntry?.ID) return;
                GetMetadata(currentEntry.ID).then((metadata) => {
                    const modal = {
                        type: "component",
                        component: "Metadata",
                        toggleAction: "launchpad.view-metadata",
                        title: `Request ${currentEntryIndex + 1} Metadata`,
                        content: metadata,
                        requestID: currentEntry.ID,
                    };
                    if (!$modalStore[0]) {
                        modalStore.trigger(modal);
                    } else if ($modalStore[0].component === "Metadata") {
                        modalStore.close();
                    }
                });
            },
        },
    ];
    useMenuActions(launchpadMenu);
</script>

<MarasiKeys menuOptions={launchpadMenu} />

<Accordion rounded="none" class="bg-surface-50 dark:bg-surface-900 text-surface-900-50-token">
    <AccordionItem bind:open={accOpened}>
        <svelte:fragment slot="lead"><SettingsIcon /></svelte:fragment>
        <svelte:fragment slot="summary">Launchpad Settings</svelte:fragment>
        <svelte:fragment slot="content">
            <div class="p-1">
                {activeLaunchpad?.Description || "No description"}
            </div>
        </svelte:fragment>
    </AccordionItem>
</Accordion>
<div>
    {#if launchpads.length === 0}
        <div class="flex flex-col items-center justify-center mt-12 opacity-50">
            <h3 class="text-xl font-bold">No Launchpads</h3>
            <p>Create one from ledger.</p>
        </div>
    {:else if activeLaunchpad}
        <div
            class="flex justify-between items-center bg-surface-200 dark:bg-surface-800/50 p-4 mb-4"
        >
            <button
                class="btn {$modeCurrent ? 'variant-ghost-primary ring-0 shadow-none' : 'variant-filled-primary hover:bg-primary-800 disabled:bg-surface-500'}"
                on:click={() => navLaunchpad(-1)}
                disabled={currentLaunchpadIndex === 0}
            >
                <ChevronLeftIcon size={24} />
            </button>

            <div class="text-center">
                <h2 class="font-bold text-xl">{activeLaunchpad.Name}</h2>
                <small class="opacity-70"
                    >{currentLaunchpadIndex + 1} of {launchpads.length}</small
                >
            </div>

            <button
                class="btn {$modeCurrent ? 'variant-ghost-primary ring-0 shadow-none' : 'variant-filled-primary hover:bg-primary-800 disabled:bg-surface-500'}"
                on:click={() => navLaunchpad(1)}
                disabled={currentLaunchpadIndex >= launchpads.length - 1}
            >
                <ChevronRightIcon size={24} />
            </button>
        </div>
        {#if activeEntries.length === 0}
            <div class="text-center py-10 opacity-50">
                <p>No requests loaded in this launchpad.</p>
            </div>
        {:else}
            <div
                class="flex justify-between items-center bg-surface-200 dark:bg-surface-800/50 p-4 mb-4"
            >
                <button
                    class="btn {$modeCurrent ? 'variant-ghost-primary ring-0 shadow-none' : 'variant-filled-primary hover:bg-primary-800 disabled:bg-surface-500'}"
                    on:click={() => navEntry(-1)}
                    disabled={currentEntryIndex === 0}
                >
                    <ArrowLeftIcon size={18} />
                </button>
                <span class="text-sm font-bold"
                    >Request {currentEntryIndex + 1} of {activeEntries.length}</span
                >
                <button
                    class="btn {$modeCurrent ? 'variant-ghost-primary ring-0 shadow-none' : 'variant-filled-primary hover:bg-primary-800 disabled:bg-surface-500'}"
                    on:click={() => navEntry(1)}
                    disabled={currentEntryIndex >= activeEntries.length - 1}
                >
                    <ArrowRightIcon size={18} />
                </button>
            </div>

            <div class="card p-4 mx-4 bg-surface-50 dark:bg-surface-800">
                <div
                    class="flex justify-center items-center gap-6 mb-4 border-b border-surface-500/20 pb-4"
                >
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold">HTTPS</span>
                        <SlideToggle
                            name="TLS Toggle"
                            checked={draft?.useHttps ?? true}
                            on:change={(event) => setUseHttps(event.target.checked)}
                            size="sm"
                        />
                    </div>
                    <button
                        class="btn btn-sm {$modeCurrent ? 'variant-ghost-primary ring-0 shadow-none' : 'variant-filled-primary'}"
                        on:click={sendRequest}
                        disabled={isSending || !$listener.status}
                    >
                        {#if isSending}
                            <ProgressRadial
                                width="w-4"
                                stroke={100}
                                meter="stroke-surface-50"
                                track="stroke-surface-500/30"
                            />
                            <span class="ml-2">Sending...</span>
                        {:else}
                            <SendIcon size={16} class="mr-2" /> Send
                        {/if}
                    </button>
                </div>

                {#if currentEntry?.ID}
                    {#key editorKey}
                        <RequestResponseView
                            request_id={currentEntry.ID}
                            titleText={"Request " + (currentEntryIndex + 1)}
                            bind:requestBody={editorBody}
                            bind:userEdited={editorEdited}
                            requestReadOnly={false}
                        />
                    {/key}
                {/if}
            </div>
        {/if}
    {/if}
</div>
