// Marasi refuses a bulk change on a ⌘A (query) selection while a job its
// query depends on is still building, and changes nothing: a text term needs
// the search indexes, a sitemap condition the sitemap. The app's Go side
// reports it as "selection_incomplete (traffic_index, annotation_index)"
// inside the error's text, which is all Wails passes on (errorCodes.js).
import { codeIDs } from "../errorCodes.js";

// What each job builds, in the researcher's words.
const BUILDS = {
  traffic_index: "search index",
  annotation_index: "search index",
  sitemap: "sitemap",
};

/** The jobs a refused selection waits for, or null for any other error. */
export const incompleteJobs = (error) => codeIDs(error, "selection_incomplete");

/** "Marasi is still building its search index and sitemap, so nothing changed." */
export function incompleteText(jobs) {
  const builds = [...new Set(jobs.map((job) => BUILDS[job] ?? job.replaceAll("_", " ")))];
  const what = builds.length > 1 ? `${builds.slice(0, -1).join(", ")} and ${builds.at(-1)}` : builds[0] ?? "indexes";
  return `Marasi is still building its ${what}, so nothing changed. Try again once it finishes.`;
}
