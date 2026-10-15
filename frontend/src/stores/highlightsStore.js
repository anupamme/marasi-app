// The highlight palette bound to the Wails backend. The fallback logic lives
// in lib/ledger/highlights.js, which tests load without bindings.
import { derived, writable } from "svelte/store";
import {
  GetHighlights,
  ResetHighlights,
  SaveHighlights,
} from "../lib/wailsjs/go/main/App";
import { effectivePalette } from "../lib/ledger/highlights.js";

/** The app config's 8 highlights ({ color, label }); null until loaded. */
export const appHighlights = writable(null);

/**
 * The open project's highlight labels by number ({ 3: "IDOR candidate" }).
 * Empty until project labels are read from the project's client settings.
 */
export const projectHighlightLabels = writable({});

/** The effective palette; see effectivePalette. */
export const highlightPalette = derived(
  [appHighlights, projectHighlightLabels],
  ([$app, $project]) => effectivePalette($app, $project),
);

export async function readHighlights() {
  try {
    appHighlights.set(await GetHighlights());
  } catch (error) {
    console.error("reading highlights, using defaults:", error);
  }
}

/** Saves all 8 app highlights; resolves to the saved list or rejects. */
export async function saveHighlights(highlights) {
  const saved = await SaveHighlights(highlights);
  appHighlights.set(saved);
  return saved;
}

export async function resetHighlights() {
  const saved = await ResetHighlights();
  appHighlights.set(saved);
  return saved;
}
