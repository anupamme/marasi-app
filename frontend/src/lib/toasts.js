/**
 * Shows an error toast: `message`, then ": <error>" when there is an error,
 * such as "Failed to save the query: disk full".
 */
export function toastError(toastStore, message, error) {
  toastStore.trigger({
    message: error ? `${message}: ${String(error)}` : message,
    background: "variant-filled-error",
  });
}
