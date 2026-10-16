// The Armory lists a run's traffic: the pairs ListArmoryRunTraffic loaded
// when the run was chosen, kept current by the recent traffic, which holds
// the newest pairs as they arrive.

/**
 * The run's pairs, oldest first: `loaded`, with any newer copy of a pair
 * from `recent` (its response may have arrived since), then the pairs in
 * `recent` the run sent that `loaded` lacks.
 */
export function runTraffic(loaded, recent, runId) {
  if (runId == null) return [];
  const sent = (recent ?? []).filter(
    (item) => String(item?.Metadata?.armory_run_id) === String(runId),
  );
  const latest = new Map(sent.map((item) => [String(item.ID), item]));
  const rows = (loaded ?? []).map((item) => {
    const id = String(item.ID);
    const fresh = latest.get(id);
    latest.delete(id);
    return fresh ?? item;
  });
  return [...rows, ...latest.values()];
}
