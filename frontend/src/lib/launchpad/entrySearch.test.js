import { test } from "node:test";
import assert from "node:assert/strict";
import { entrySearchQuery, MIN_ENTRY_SEARCH } from "./entrySearch.js";

// The string rule of Marasi's AIP-160 lexer (go.einride.tech/aip): a "…"
// literal ends at the first quote not preceded by an unescaped backslash, and
// \\ and \" unescape to \ and ". Returns the literals and the text between them.
function lex(query) {
  const literals = [];
  const between = [];
  let outside = "";
  for (let i = 0; i < query.length; i += 1) {
    if (query[i] !== '"') {
      outside += query[i];
      continue;
    }
    between.push(outside);
    outside = "";
    let value = "";
    for (i += 1; query[i] !== '"'; i += 1) {
      assert.ok(i < query.length, "unterminated string");
      if (query[i] === "\\") i += 1;
      value += query[i];
    }
    literals.push(value);
  }
  between.push(outside);
  return { literals, between };
}

const PARTS = ["request_head", "request_body", "response_head", "response_body"];

test("plain text searches the request and response heads and bodies", () => {
  assert.deepEqual(entrySearchQuery("token"), {
    query:
      'request_head:"token" OR request_body:"token" OR response_head:"token" OR response_body:"token"',
  });
});

test("quotes and backslashes are escaped inside one literal", () => {
  assert.equal(
    entrySearchQuery('a"b\\c').query,
    'request_head:"a\\"b\\\\c" OR request_body:"a\\"b\\\\c" OR response_head:"a\\"b\\\\c" OR response_body:"a\\"b\\\\c"',
  );
});

test("text shorter than the trigram minimum queries nothing", () => {
  assert.equal(MIN_ENTRY_SEARCH, 3);
  assert.deepEqual(entrySearchQuery("ab"), { query: null });
  assert.deepEqual(entrySearchQuery("   ab  "), { query: null });
  // Counted in code points: two emoji are four UTF-16 units but two characters.
  assert.equal(entrySearchQuery("😀😀").query, null);
  assert.ok(entrySearchQuery("a😀b").query);
});

test("surrounding whitespace is trimmed, inner whitespace kept", () => {
  assert.equal(lex(entrySearchQuery("  a b  ").query).literals[0], "a b");
});

const HOSTILE = [
  '"x"',
  '""" or """',
  "a\\b",
  "\\\\\\",
  'x" OR "1',
  'x\\" OR \\"1',
  "foo OR bar",
  "a AND NOT b",
  "-foo",
  'launchpad = "01937f5d-351a-7e68-936d-61a7a25661a3"',
  "launchpad:*",
  "))) (((",
  "NEAR(foo bar)",
  "foo*",
  "^start",
  "col:value",
  "tab\there",
  "line\nbreak",
  "'single' quotes",
];

test("hostile text only ever becomes one literal per searched part", () => {
  for (const text of HOSTILE) {
    const { query } = entrySearchQuery(text);
    const { literals, between } = lex(query);
    assert.deepEqual(literals, PARTS.map(() => text.trim()), `literals for ${JSON.stringify(text)}`);
    assert.deepEqual(
      between,
      ["request_head:", " OR request_body:", " OR response_head:", " OR response_body:", ""],
      `structure for ${JSON.stringify(text)}`,
    );
  }
});

test("text too long for Marasi's query limit is an error, not a query", () => {
  const result = entrySearchQuery("x".repeat(5000));
  assert.equal(result.query, null);
  assert.match(result.error, /too long/i);
  // Under the limit it still builds.
  assert.ok(entrySearchQuery("x".repeat(1900)).query);
});

test("the length limit counts escaped bytes, not characters", () => {
  // 1500 quotes escape to 3000 bytes per literal: four literals exceed 8 KB.
  assert.match(entrySearchQuery('"'.repeat(1500)).error, /too long/i);
  // 700 three-byte characters are 2100 bytes per literal: also too long.
  assert.match(entrySearchQuery("€".repeat(700)).error, /too long/i);
});
