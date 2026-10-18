// Marasi refuses to delete a pending launch's pair, to remove it from the
// launchpad it was launched from, and to delete that launchpad, and changes
// nothing (marasi ADR-0049). The app's Go side reports it as
// "launch_pending (<id>, <id>)" inside the error's text, which is all Wails
// passes on. The ids are the pending launches' pairs.

const CODE = /launch_pending \(([^)]*)\)/;

/** The pending pairs a refusal names, or null for any other error. */
export function pendingLaunchIDs(error) {
  const match = CODE.exec(String(error ?? ""));
  if (!match) return null;
  return match[1]
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** "3 pairs are still launching; nothing was deleted". */
export function pendingLaunchText(count, verb) {
  const pairs = count === 1 ? "1 pair is" : `${count.toLocaleString()} pairs are`;
  return `${pairs} still launching; nothing was ${verb}`;
}
