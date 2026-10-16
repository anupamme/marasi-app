import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequestPicker, PICKER_DELAY_MS, requestPickerQuery, searchRequests } from "./requestPicker.js";

test("the picker's text matches anywhere in the host or the path", () => {
  assert.equal(requestPickerQuery(""), "");
  assert.equal(requestPickerQuery("  login "), 'host = "*login*" OR path = "*login*"');
});

test("quotes and backslashes in the picker's text can't break the query", () => {
  assert.equal(requestPickerQuery('a"b\\c'), 'host = "*abc*" OR path = "*abc*"');
});

test("a search reads the newest matching pairs of every content type as options", async () => {
  const calls = [];
  const queryTraffic = async (req) => {
    calls.push(req);
    return { Items: [{ ID: "p2", Method: "POST", Scheme: "https", Host: "a.test", Path: "/login" }] };
  };
  const options = await searchRequests(queryTraffic, "login");
  assert.deepEqual(calls, [
    { Query: 'host = "*login*" OR path = "*login*"', OrderBy: "requested_at desc", Limit: 100, IgnoreExclusion: true },
  ]);
  assert.equal(options.length, 1);
  assert.equal(options[0].value, "p2");
  assert.equal(options[0].label, "POST https://a.test/login");
});

test("a failed search offers nothing", async () => {
  const options = await searchRequests(async () => ({ QueryError: { Message: "bad" } }), "x");
  assert.deepEqual(options, []);
});

test("a picker searches once typing pauses, and only the latest search lands", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const searched = [];
  const answers = {};
  const picker = createRequestPicker((text) => {
    searched.push(text);
    return new Promise((resolve) => (answers[text] = resolve));
  });
  let options;
  picker.subscribe((value) => (options = value));

  picker.search("lo");
  t.mock.timers.tick(PICKER_DELAY_MS - 50);
  picker.search("log");
  t.mock.timers.tick(PICKER_DELAY_MS);
  assert.deepEqual(searched, ["log"], "one search, for the text typing paused on");

  picker.search("logi");
  t.mock.timers.tick(PICKER_DELAY_MS);
  answers.logi([{ value: "b" }]);
  answers.log([{ value: "a" }]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(options, [{ value: "b" }], "an older search that lands late is dropped");

  picker.search("  ");
  assert.deepEqual(options, [], "blank text offers nothing at once");
  picker.cancel();
});
