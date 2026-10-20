// Marasi refuses to delete a pending launch's pair, to remove it from the
// launchpad it was launched from, and to delete that launchpad, and changes
// nothing (marasi docs/adr/2026-10-18-a-pending-launchs-pair-stays-in-its-launchpad.md). The app's Go side reports it as
// "launch_pending (<id>, <id>)" inside the error's text, which is all Wails
// passes on (errorCodes.js). The ids are the pending launches' pairs.
import { codeIDs } from "./errorCodes.js";

/** The pending pairs a refusal names, or null for any other error. */
export const pendingLaunchIDs = (error) => codeIDs(error, "launch_pending");

/**
 * The ids of `ids` whose launch in `launches` ({ ID, LaunchpadID, Status })
 * is pending, from `launchpadId` when given. Marasi refuses to delete such a
 * pair, and to move or remove it from the launchpad it was launched from.
 */
export function launchingIds(launches, ids, launchpadId = null) {
  const pending = new Set(
    launches
      .filter((launch) => launch.Status === "pending" && (launchpadId == null || launch.LaunchpadID === launchpadId))
      .map((launch) => String(launch.ID)),
  );
  return ids.filter((id) => pending.has(String(id)));
}

/**
 * Greys a Move, Remove or Delete item whose entries or pairs include
 * `launching` still launching: "2 launching".
 */
export const unlessLaunching = (launching) => (launching ? { disabled: true, hint: launchingHint(launching) } : {});

/** "2 launching": why a Move, Remove or Delete is greyed. */
export const launchingHint = (count) => `${count.toLocaleString()} launching`;

const PLURALS = { pair: "pairs", entry: "entries" };

/**
 * "3 pairs are still launching; nothing was deleted". On a launchpad the
 * `noun` is "entry": "2 entries are still launching; nothing was moved".
 */
export function pendingLaunchText(count, verb, noun = "pair") {
  const what = count === 1 ? `1 ${noun} is` : `${count.toLocaleString()} ${PLURALS[noun]} are`;
  return `${what} still launching; nothing was ${verb}`;
}

/** Why a launchpad with a pending launch cannot be deleted. */
export const DELETE_LAUNCHPAD_PENDING_HINT = "Launching: cancel or wait";

/** Shows `message`, why something still launching stopped an action, as a warning toast. */
export function warnLaunching(toastStore, message) {
  toastStore.trigger({ message, background: "variant-filled-warning" });
}

/**
 * Toasts why Marasi refused an action for pending launches, with
 * pendingLaunchText(count, verb, noun), and returns true. Returns false,
 * toasting nothing, for any other error, so the caller reports it.
 */
export function toastLaunchingRefusal(toastStore, error, verb, noun = "pair") {
  const ids = pendingLaunchIDs(error);
  if (!ids) return false;
  warnLaunching(toastStore, pendingLaunchText(ids.length, verb, noun));
  return true;
}
