// Prettified copies of a pair's request and response, from the full pair read
// (GetRawDetails). Marasi returns "" for a part it could not prettify, and
// coalesces pairs captured before it moved prettified copies out of metadata.

/**
 * @param {any} row a RequestResponseRow
 * @param {"request" | "response"} part
 * @returns {string | null} the prettified copy, or null when there is none
 */
export function prettifiedBody(row, part) {
  const copy =
    part === "request" ? row?.Prettified?.Request : row?.Prettified?.Response;
  return copy || null;
}
