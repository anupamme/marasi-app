// Sizing rules for the Launchpad dock: drag to resize, snap to a strip.
export const DOCK = { default: 400, min: 260, max: 640, snap: 170 };

/** The live width while dragging `delta` px from `startWidth`. */
export function dragWidth(startWidth, delta) {
  return Math.min(DOCK.max, Math.max(0, startWidth + delta));
}

/**
 * Where the dock settles when the drag ends at `width`. Below the snap point
 * it collapses and keeps `previousWidth` for the next expand.
 */
export function settleDrag(width, previousWidth) {
  if (width < DOCK.snap) return { collapsed: true, width: previousWidth };
  return { collapsed: false, width: Math.max(DOCK.min, width) };
}
