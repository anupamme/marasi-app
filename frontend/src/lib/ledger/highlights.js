// The highlight palette: what each highlight number (1-8) looks like and is
// called. Colours are app-wide (the app config YAML). A label is the
// project's label, else the app's, else the colour's own name (ADR 0004).

/** The spec's default colours; `name` is the label of an unlabelled highlight. */
export const DEFAULT_HIGHLIGHTS = Object.freeze(
  [
    ["Red", "#ef4444"],
    ["Orange", "#f97316"],
    ["Yellow", "#eab308"],
    ["Green", "#22c55e"],
    ["Cyan", "#06b6d4"],
    ["Blue", "#3b82f6"],
    ["Purple", "#a855f7"],
    ["Pink", "#ec4899"],
  ].map(([name, color], i) => Object.freeze({ number: i + 1, name, color })),
);

const present = (label) => (typeof label === "string" && label.trim() ? label.trim() : null);

/**
 * The effective palette, one entry per highlight number in order.
 *
 * @param {{color: string, label: string}[] | undefined} appHighlights
 *   The app config's 8 highlights (GetHighlights), index = number - 1.
 *   Missing entries use the defaults.
 * @param {Record<number, string>} [projectLabels]
 *   The open project's labels by number (client setting `ledger.highlight.<n>`).
 * @returns {{number: number, name: string, color: string, label: string,
 *   appLabel: string|null, projectLabel: string|null,
 *   scope: "project"|"app"|null}[]}
 *   `scope` says where the label came from; null means the colour's name.
 */
export function effectivePalette(appHighlights, projectLabels = {}) {
  return DEFAULT_HIGHLIGHTS.map((fallback, i) => {
    const app = appHighlights?.[i];
    const appLabel = present(app?.label);
    const projectLabel = present(projectLabels?.[fallback.number]);
    return {
      number: fallback.number,
      name: fallback.name,
      color: app?.color || fallback.color,
      label: projectLabel ?? appLabel ?? fallback.name,
      appLabel,
      projectLabel,
      scope: projectLabel ? "project" : appLabel ? "app" : null,
    };
  });
}
