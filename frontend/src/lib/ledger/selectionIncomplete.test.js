import { test } from "node:test";
import assert from "node:assert/strict";
import { incompleteJobs, incompleteText } from "./selectionIncomplete.js";

test("a refused selection's jobs are read from the error's text", () => {
  const error = "setting highlight 3: selection_incomplete (traffic_index, annotation_index): the selection depends on an unfinished background job: traffic_index, annotation_index";
  assert.deepEqual(incompleteJobs(error), ["traffic_index", "annotation_index"]);
  assert.deepEqual(incompleteJobs(new Error("deleting traffic: selection_incomplete (sitemap): …")), ["sitemap"]);
  assert.equal(incompleteJobs("deleting traffic: disk full"), null);
  assert.equal(incompleteJobs(undefined), null);
});

test("the text names what Marasi is building, once each", () => {
  assert.equal(
    incompleteText(["traffic_index", "annotation_index"]),
    "Marasi is still building its search index, so nothing changed. Try again once it finishes.",
  );
  assert.equal(
    incompleteText(["traffic_index", "sitemap"]),
    "Marasi is still building its search index and sitemap, so nothing changed. Try again once it finishes.",
  );
});
