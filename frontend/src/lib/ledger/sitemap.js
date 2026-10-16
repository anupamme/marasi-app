// The sitemap dock's query terms and labels. Choosing a node narrows the
// query with `sitemap = "<node name>"`; the eye-off button adds
// `sitemap != "<node name>"`. Node names are Marasi's canonical paths
// (ADR-0040), such as https://api.acme.test/v2/users/{int}.
//
// Plain module: no Svelte component dependencies.
import { appendToQuery, hasQueryTerm } from "../ledgerQueryFields.js";

/** The segments Marasi collapses ids into; the dock shows them in italics. */
const PLACEHOLDERS = new Set(["{uuid}", "{int}", "{hash}"]);

export function isPlaceholder(segment) {
  return PLACEHOLDERS.has(segment);
}

function quote(name) {
  return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** The term that narrows the query to a node and everything under it. */
export function sitemapTerm(name) {
  return `sitemap = ${quote(name)}`;
}

/** The term that leaves a node and everything under it out of the query. */
export function sitemapExcludeTerm(name) {
  return `sitemap != ${quote(name)}`;
}

// Splits query text into words with their offsets, as the query box's term
// toggles do: whitespace separates words, a quoted string stays inside its
// word, each parenthesis is a word of its own, and `depth` counts the open
// parentheses around a word.
function queryWords(text) {
  const words = [];
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "(" || ch === ")") {
      if (ch === ")") depth = Math.max(depth - 1, 0);
      words.push({ text: ch, start: i, end: i + 1, depth });
      if (ch === "(") depth++;
      i++;
    } else {
      const start = i;
      while (i < text.length && !/[\s()]/.test(text[i])) {
        if (text[i] === '"') {
          i++;
          while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
        }
        i++;
      }
      i = Math.min(i, text.length);
      words.push({ text: text.slice(start, i), start, end: i, depth });
    }
  }
  return words;
}

const TERM = /^sitemap="((?:[^"\\]|\\.)*)"$/;

// The `sitemap = "…"` terms that stand on their own in the query: outside
// parentheses, not negated and not joined by OR. A term may be written as
// one to three words (`sitemap="x"`, `sitemap = "x"`). Each is
// { name, first, last }, as word indexes.
function sitemapTerms(words) {
  const terms = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i].depth !== 0 || !words[i].text.startsWith("sitemap")) continue;
    let joined = "";
    for (let j = i; j < Math.min(i + 3, words.length) && words[j].depth === 0; j++) {
      joined += words[j].text;
      const match = joined.match(TERM);
      if (!match) continue;
      const before = words[i - 1]?.text;
      const after = words[j + 1]?.text;
      if (before !== "NOT" && before !== "OR" && after !== "OR") {
        terms.push({ name: match[1].replace(/\\(.)/g, "$1"), first: i, last: j });
      }
      i = j;
      break;
    }
  }
  return terms;
}

// Removes the words first..last from the text, with the AND that joined
// them, leaving the rest as typed.
function removeWords(text, words, first, last) {
  if (words[first - 1]?.text === "AND") first--;
  else if (words[last + 1]?.text === "AND") last++;
  const next = words[last + 1];
  const from = next ? words[first].start : (words[first - 1]?.end ?? 0);
  const to = next ? next.start : text.length;
  return (text.slice(0, from) + text.slice(to)).trim();
}

/** The node the query narrows to with its own `sitemap = "…"` term, or null. */
export function activeSitemapNode(text) {
  return sitemapTerms(queryWords(text ?? ""))[0]?.name ?? null;
}

/**
 * The query after choosing a node: any earlier `sitemap = "…"` term is
 * replaced by the node's, and choosing the active node again removes it.
 */
export function chooseSitemapNode(text, name) {
  const wasActive = activeSitemapNode(text) === name;
  let rest = text;
  for (;;) {
    const words = queryWords(rest);
    const [term] = sitemapTerms(words);
    if (!term) break;
    rest = removeWords(rest, words, term.first, term.last);
  }
  return wasActive ? rest : appendToQuery(rest.trimEnd(), sitemapTerm(name));
}

/** The query with `sitemap != "<name>"` added, unless it has it already. */
export function excludeSitemapNode(text, name) {
  const term = sitemapExcludeTerm(name);
  return hasQueryTerm(text, term) ? text : appendToQuery(text.trimEnd(), term);
}

/** The collapsed strip's label: the active node without its scheme. */
export function stripLabel(name) {
  return name ? name.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") : "Sitemap";
}
