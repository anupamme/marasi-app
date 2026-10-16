import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_TYPE_GROUPS,
  groupOf,
  groupState,
  hiddenBy,
  isExclusionValue,
  normalizeContentType,
  toggleGroup,
  toggleType,
  typeLabel,
  typeLists,
  exclusionGroups,
} from "./contentTypes.js";

const group = (label) => CONTENT_TYPE_GROUPS.find((g) => g.label === label);

test("content types are normalised as Marasi does: lowercase, no parameters", () => {
  assert.equal(normalizeContentType(" Text/HTML; charset=UTF-8 "), "text/html");
  assert.equal(normalizeContentType("IMAGE/*"), "image/*");
});

test("an exact value hides only that type", () => {
  assert.equal(hiddenBy("text/css", ["text/css"]), "text/css");
  assert.equal(hiddenBy("text/html", ["text/css"]), null);
});

test("major/* hides every subtype of the major type", () => {
  assert.equal(hiddenBy("image/png", ["image/*"]), "image/*");
  assert.equal(hiddenBy("image/svg+xml", ["text/css", "image/*"]), "image/*");
  assert.equal(hiddenBy("imagex/png", ["image/*"]), null);
});

test("a pair's content type is matched after normalising it", () => {
  assert.equal(hiddenBy("Image/PNG; q=1", ["image/png"]), "image/png");
});

test("a pair with no content type is never hidden", () => {
  assert.equal(hiddenBy("", ["image/*"]), null);
  assert.equal(hiddenBy(undefined, ["image/*"]), null);
});

test("Images, Fonts, Audio and Video use major/*; the other groups list exact types", () => {
  assert.deepEqual(group("Images").types, ["image/*"]);
  assert.equal(group("Fonts").types[0], "font/*");
  assert.deepEqual(group("Audio").types, ["audio/*"]);
  assert.deepEqual(group("Video").types, ["video/*"]);
  assert.ok(group("Scripts").types.includes("application/javascript"));
  assert.ok(group("Scripts").types.every((t) => !t.endsWith("/*")));
});

test("no value is in two groups", () => {
  const all = CONTENT_TYPE_GROUPS.flatMap((g) => g.types);
  assert.equal(new Set(all).size, all.length);
});

test("a type belongs to the group listing it or its major type", () => {
  assert.equal(groupOf("image/png")?.label, "Images");
  assert.equal(groupOf("application/x-font-woff")?.label, "Fonts");
  assert.equal(groupOf("text/css")?.label, "Styles");
  assert.equal(groupOf("application/x-unknown"), undefined);
});

test("a major-type group is hidden by its major/*, partial with only some subtypes hidden", () => {
  assert.equal(groupState(group("Images"), []), "shown");
  assert.equal(groupState(group("Images"), ["image/*"]), "hidden");
  assert.equal(groupState(group("Images"), ["image/png"]), "partial");
});

test("an exact group is shown, partial or hidden by how many of its types are excluded", () => {
  const scripts = group("Scripts");
  assert.equal(groupState(scripts, []), "shown");
  assert.equal(groupState(scripts, ["application/javascript"]), "partial");
  assert.equal(groupState(scripts, scripts.types), "hidden");
});

test("an exact group hidden through a major/* reads as hidden", () => {
  assert.equal(groupState(group("Styles"), ["text/*"]), "hidden");
});

test("hiding a shown major-type group stores its major/*", () => {
  assert.deepEqual(toggleGroup(group("Images"), ["text/css"]), ["text/css", "image/*"]);
});

test("toggling a shown exact group hides all its types and keeps other exclusions", () => {
  assert.deepEqual(toggleGroup(group("Styles"), ["image/*"]), ["image/*", "text/css"]);
});

test("toggling a partial or hidden group shows it: its values and covered subtypes go", () => {
  assert.deepEqual(toggleGroup(group("Images"), ["image/png", "text/css"]), ["text/css"]);
  assert.deepEqual(toggleGroup(group("Images"), ["image/*", "text/css"]), ["text/css"]);
  assert.deepEqual(toggleGroup(group("Scripts"), ["application/javascript", "image/*"]), ["image/*"]);
});

test("toggling a type flips only that exact value", () => {
  assert.deepEqual(toggleType("text/css", ["image/*"]), ["image/*", "text/css"]);
  assert.deepEqual(toggleType("text/css", ["text/css", "image/*"]), ["image/*"]);
});

test("a type hidden through its major/* can't be shown on its own", () => {
  assert.deepEqual(toggleType("image/png", ["image/*"]), ["image/*"]);
});

const types = (list) => list.map((e) => e.contentType);
const counts = [
  { ContentType: "application/json", Count: 9 },
  { ContentType: "image/png", Count: 6 },
  { ContentType: "text/html", Count: 4 },
  { ContentType: "image/gif", Count: 3 },
  { ContentType: "text/css", Count: 2 },
  { ContentType: "", Count: 1 },
];

test("shown and hidden lists are sorted by pair count; exclusion values without traffic are idle", () => {
  const lists = typeLists(counts, ["image/*", "text/css", "font/woff2", "video/*"]);
  assert.deepEqual(types(lists.shown), ["application/json", "text/html", ""]);
  assert.deepEqual(types(lists.hidden), ["image/png", "image/gif", "text/css"]);
  assert.deepEqual(types(lists.idle), ["font/woff2", "video/*"]);
});

test("a hidden type says which exclusion value hides it", () => {
  const lists = typeLists(counts, ["image/*", "text/css"]);
  assert.deepEqual(
    lists.hidden.map((e) => [e.contentType, e.hiddenBy, e.group]),
    [
      ["image/png", "image/*", "Images"],
      ["image/gif", "image/*", "Images"],
      ["text/css", "text/css", "Styles"],
    ],
  );
});

test("the no-response row is always shown, even with no such pairs", () => {
  const lists = typeLists([{ ContentType: "text/html", Count: 1 }], ["text/html"]);
  assert.deepEqual(lists.shown.map((e) => [e.contentType, e.count]), [["", 0]]);
  assert.equal(typeLabel(""), "(no response)");
  assert.equal(typeLabel("text/html"), "text/html");
});

test("counts for the same normalised type are merged", () => {
  const lists = typeLists(
    [
      { ContentType: "text/html", Count: 2 },
      { ContentType: "Text/HTML; charset=utf-8", Count: 3 },
    ],
    [],
  );
  assert.deepEqual(lists.shown.map((e) => [e.contentType, e.count]), [["text/html", 5], ["", 0]]);
});

test("find matches a type, its group label or the no-response label, ignoring case", () => {
  assert.deepEqual(types(typeLists(counts, [], "HTML").shown), ["text/html"]);
  assert.deepEqual(types(typeLists(counts, [], "images").shown), ["image/png", "image/gif"]);
  assert.deepEqual(types(typeLists(counts, [], "no resp").shown), [""]);
});

test("a full type or major/* that is in no list can be added", () => {
  assert.equal(typeLists(counts, [], "application/x-protobuf").addable, "application/x-protobuf");
  assert.equal(typeLists(counts, [], "Font/*").addable, "font/*");
  assert.equal(typeLists(counts, [], "text/html").addable, null);
  assert.equal(typeLists(counts, ["video/*"], "video/*").addable, null);
  assert.equal(typeLists(counts, [], "protobuf").addable, null);
  assert.equal(typeLists(counts, [], "*/json").addable, null);
});

test("an exclusion value is a type/subtype or type/*, in any case", () => {
  assert.ok(isExclusionValue("Font/WOFF2"));
  assert.ok(isExclusionValue("image/*"));
  assert.ok(!isExclusionValue("image"));
  assert.ok(!isExclusionValue("image/*x"));
  assert.ok(!isExclusionValue(""));
});

const labels = (r) => r.groups.map((g) => [g.label, g.types]);

test("Settings lists the exclusion by group, in menu order, Other last, types sorted", () => {
  const r = exclusionGroups(["video/mp4", "application/x-protobuf", "image/png", "audio/*", "image/gif"], "");
  assert.deepEqual(labels(r), [
    ["Images", ["image/gif", "image/png"]],
    ["Audio", ["audio/*"]],
    ["Video", ["video/mp4"]],
    ["Other", ["application/x-protobuf"]],
  ]);
  assert.equal(r.shown, 5);
});

test("the Settings box filters by type or group label, ignoring case", () => {
  const exclusion = ["image/png", "font/woff2", "text/css"];
  assert.deepEqual(labels(exclusionGroups(exclusion, "WOFF")), [["Fonts", ["font/woff2"]]]);
  assert.deepEqual(labels(exclusionGroups(exclusion, "styles")), [["Styles", ["text/css"]]]);
  assert.equal(exclusionGroups(exclusion, "zzz").shown, 0);
});

test("the Settings box can add a valid value the list doesn't have", () => {
  assert.equal(exclusionGroups(["image/png"], " Application/X-Protobuf; q=1").addable, "application/x-protobuf");
  assert.equal(exclusionGroups(["image/png"], "image/png").addable, null);
  assert.equal(exclusionGroups(["image/png"], "image/png").exists, true);
  assert.equal(exclusionGroups(["image/png"], "image").addable, null);
  assert.equal(exclusionGroups(["image/png"], "").addable, null);
});
