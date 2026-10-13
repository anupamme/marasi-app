import { test } from "node:test";
import assert from "node:assert/strict";
import { autoExpand, collapseAll, expandAll, revealEntry } from "./treeExpansion.js";

const launchpads = [{ ID: "lp1" }, { ID: "lp2" }];
const entriesByLaunchpad = {
  lp1: [{ ID: "a", StatusCode: 200 }, { ID: "b", StatusCode: 200 }, { ID: "c", StatusCode: 404 }],
  lp2: [{ ID: "d", StatusCode: 200 }, { ID: "e", StatusCode: 0 }],
};

test("expand all opens every launchpad", () => {
  const { expanded } = expandAll({ launchpads, entriesByLaunchpad, groupByStatus: false });
  assert.deepEqual(expanded, { lp1: true, lp2: true });
});

test("expand all with group by status also opens every status folder", () => {
  const { openGroups } = expandAll({ launchpads, entriesByLaunchpad, groupByStatus: true });
  // The original entry (first) sits outside the folders.
  assert.deepEqual(openGroups, { "lp1:200": true, "lp1:404": true, "lp2:pending": true });
});

test("expand all keeps folder choices when not grouping", () => {
  const openGroups = { "lp1:404": false };
  const result = expandAll({ launchpads, entriesByLaunchpad, groupByStatus: false, openGroups });
  assert.deepEqual(result.openGroups, { "lp1:404": false });
});

test("collapse all closes every launchpad and every status folder", () => {
  const result = collapseAll({ launchpads, entriesByLaunchpad });
  assert.deepEqual(result.expanded, { lp1: false, lp2: false });
  assert.deepEqual(result.openGroups, { "lp1:200": false, "lp1:404": false, "lp2:pending": false });
});

test("the selected launchpad opens on its own the first time it is selected", () => {
  assert.deepEqual(autoExpand({ lp2: false }, "lp1"), { lp2: false, lp1: true });
});

test("collapse all sticks: the selected launchpad does not reopen itself", () => {
  const { expanded } = collapseAll({ launchpads, entriesByLaunchpad });
  assert.deepEqual(autoExpand(expanded, "lp1"), { lp1: false, lp2: false });
});

test("auto-expand with nothing selected changes nothing", () => {
  const expanded = { lp1: false };
  assert.equal(autoExpand(expanded, null), expanded);
});

test("revealing an entry opens its launchpad and its status folder, even after collapse all", () => {
  const collapsed = collapseAll({ launchpads, entriesByLaunchpad });
  const shown = revealEntry({ ...collapsed, entriesByLaunchpad, groupByStatus: true }, "lp1", "c");
  assert.deepEqual(shown.expanded, { lp1: true, lp2: false });
  assert.deepEqual(shown.openGroups, { "lp1:200": false, "lp1:404": true, "lp2:pending": false });
});

test("revealing the original entry or an ungrouped entry opens no folder", () => {
  const closed = { expanded: { lp1: false }, openGroups: { "lp1:200": false }, entriesByLaunchpad };
  assert.deepEqual(revealEntry({ ...closed, groupByStatus: true }, "lp1", "a").openGroups, { "lp1:200": false });
  assert.deepEqual(revealEntry({ ...closed, groupByStatus: false }, "lp1", "b").openGroups, { "lp1:200": false });
  assert.deepEqual(revealEntry({ ...closed, groupByStatus: false }, "lp1", "b").expanded, { lp1: true });
});
