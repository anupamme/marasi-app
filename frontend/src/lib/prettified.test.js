import { test } from "node:test";
import assert from "node:assert/strict";
import { prettifiedBody } from "./prettified.js";

const row = {
  Request: { Raw: "GET / HTTP/1.1\r\n\r\n{\"a\":1}" },
  Response: { Raw: "HTTP/1.1 200 OK\r\n\r\n{\"b\":2}" },
  Metadata: {},
  Prettified: { Request: "GET / HTTP/1.1\n\n{\n  \"a\": 1\n}", Response: "" },
};

test("the prettified copy of a part comes from the full pair read", () => {
  assert.equal(prettifiedBody(row, "request"), row.Prettified.Request);
});

test("a part Marasi could not prettify has no prettified copy", () => {
  assert.equal(prettifiedBody(row, "response"), null);
});

test("a row without prettified copies has none", () => {
  assert.equal(prettifiedBody({ Request: { Raw: "x" } }, "request"), null);
  assert.equal(prettifiedBody(undefined, "request"), null);
});
