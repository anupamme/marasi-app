// Whether a CodeMirror editor may wrap its lines without freezing the page.
//
// CodeMirror renders only part of a line of 2 × 10,000 characters or more,
// but while it first measures a wrapped line that long it draws the whole
// line once. WebKit (the desktop app) takes about 3 s to lay out a 550 KB
// line, such as a minified body, and the page freezes. Unwrapped, CodeMirror
// never draws the whole line. Shorter lines are always drawn in full anyway.

/** The longest line, in characters, an editor still wraps. */
export const LONG_LINE_LIMIT = 20_000;

/**
 * @param {string | null | undefined} text the editor's document
 * @param {boolean} wrap the Wrap lines setting
 * @returns {boolean} whether the editor should wrap
 */
export function wrapsLines(text, wrap) {
  if (!wrap || !text || text.length < LONG_LINE_LIMIT) return wrap;
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    // CodeMirror's lines end before a \r\n.
    const length = end - start - (text[end - 1] === "\r" ? 1 : 0);
    if (length >= LONG_LINE_LIMIT) return false;
    start = end + 1;
  }
  return true;
}
