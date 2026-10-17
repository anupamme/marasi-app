// The Marks menu's rows: pairs the researcher has annotated, linked or
// intercepted. Each row toggles its query term. marasi has no intercepted
// field; it records interception as metadata "intercepted": true.
import { hasQueryTerm } from "../ledgerQueryFields.js";

export const MARKS = [
  { id: "note", label: "Has note", term: "note:*" },
  { id: "finding", label: "In a finding", term: "finding:*" },
  { id: "test-case", label: "In a test case", term: "test_case:*" },
  { id: "launchpad", label: "In a launchpad", term: "launchpad:*" },
  { id: "intercepted", label: "Intercepted", term: "metadata.intercepted = true" },
];

/** How many mark terms the query has as conditions of their own. */
export function activeMarkCount(text) {
  return MARKS.filter((mark) => hasQueryTerm(text, mark.term)).length;
}
