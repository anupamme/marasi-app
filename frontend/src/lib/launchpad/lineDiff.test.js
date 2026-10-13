import { test } from "node:test";
import assert from "node:assert/strict";
import { foldRows, lineDiff } from "./lineDiff.js";

const kinds = (rows) => rows.map((row) => row.kind).join(" ");

test("identical texts are all unchanged rows with line numbers on both sides", () => {
  const { rows } = lineDiff("GET / HTTP/1.1\nHost: a", "GET / HTTP/1.1\nHost: a");
  assert.deepEqual(rows, [
    { kind: "same", left: "GET / HTTP/1.1", right: "GET / HTTP/1.1", leftNo: 1, rightNo: 1 },
    { kind: "same", left: "Host: a", right: "Host: a", leftNo: 2, rightNo: 2 },
  ]);
});

test("a replaced line pairs both sides on one changed row; an extra line is added", () => {
  const before = "HTTP/1.1 200 OK\nContent-Length: 12\n\nhello world!";
  const after = "HTTP/1.1 403 Forbidden\nContent-Length: 12\nX-Blocked: 1\n\nhello world!";
  const { rows } = lineDiff(before, after);
  assert.equal(kinds(rows), "changed same added same same");
  assert.deepEqual(rows[0], {
    kind: "changed",
    left: "HTTP/1.1 200 OK",
    right: "HTTP/1.1 403 Forbidden",
    leftNo: 1,
    rightNo: 1,
  });
  assert.deepEqual(rows[2], { kind: "added", left: null, right: "X-Blocked: 1", leftNo: null, rightNo: 3 });
  assert.deepEqual([rows[4].leftNo, rows[4].rightNo], [4, 5]);
});

test("removed lines leave the right side empty", () => {
  const { rows } = lineDiff("a\nb\nc", "a\nc");
  assert.equal(kinds(rows), "same removed same");
  assert.deepEqual(rows[1], { kind: "removed", left: "b", right: null, leftNo: 2, rightNo: null });
});

test("a run of three removed and one added line pairs the first and removes the rest", () => {
  const { rows } = lineDiff("a\nx1\nx2\nx3\nz", "a\ny1\nz");
  assert.equal(kinds(rows), "same changed removed removed same");
  assert.deepEqual([rows[1].left, rows[1].right], ["x1", "y1"]);
});

// Independent oracle: classic LCS length table over small inputs.
function lcsLength(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i += 1)
    for (let j = 1; j <= b.length; j += 1)
      t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
  return t[a.length][b.length];
}

test("random inputs: both sides read back in order and unchanged rows form a longest common subsequence", () => {
  let seed = 7;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  for (let round = 0; round < 300; round += 1) {
    const a = Array.from({ length: rand(12) }, () => "abcd"[rand(4)]);
    const b = Array.from({ length: rand(12) }, () => "abcd"[rand(4)]);
    const { rows, approximate } = lineDiff(a.join("\n"), b.join("\n"));
    const lefts = rows.filter((r) => r.left !== null).map((r) => r.left);
    const rights = rows.filter((r) => r.right !== null).map((r) => r.right);
    const leftNos = rows.filter((r) => r.leftNo !== null).map((r) => r.leftNo);
    const expectedA = a.length ? a : [""];
    const expectedB = b.length ? b : [""];
    assert.deepEqual(lefts, expectedA);
    assert.deepEqual(rights, expectedB);
    assert.deepEqual(leftNos, expectedA.map((_, i) => i + 1));
    assert.equal(rows.filter((r) => r.kind === "same").length, lcsLength(expectedA, expectedB));
    assert.equal(approximate, false);
  }
});

test("large bodies with a few edits diff exactly and quickly", () => {
  const base = Array.from({ length: 50000 }, (_, i) => `line ${i}`);
  const edited = [...base];
  edited[10] = "changed";
  edited.splice(30000, 0, "inserted");
  const started = Date.now();
  const { rows, approximate } = lineDiff(base.join("\n"), edited.join("\n"));
  assert.ok(Date.now() - started < 1000);
  assert.equal(approximate, false);
  assert.equal(kinds(rows.filter((r) => r.kind !== "same")), "changed added");
});

test("wholly different large bodies stop at the edit budget and show the middle as replaced", () => {
  const a = Array.from({ length: 20000 }, (_, i) => `a${i}`);
  const b = Array.from({ length: 20000 }, (_, i) => `b${i}`);
  a[0] = b[0] = "HTTP/1.1 200 OK";
  a.push("</html>");
  b.push("</html>");
  const started = Date.now();
  const { rows, approximate } = lineDiff(a.join("\n"), b.join("\n"));
  assert.ok(Date.now() - started < 2000);
  assert.equal(approximate, true);
  assert.equal(rows.length, 20001);
  assert.equal(rows[0].kind, "same");
  assert.equal(rows[1].kind, "changed");
  assert.equal(rows.at(-1).kind, "same");
});

const lines = (n, prefix = "l") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const shape = (items) =>
  items.map((item) => (item.fold ? `fold${item.count}` : item.row.kind[0])).join(" ");

test("long unchanged runs fold down to three lines of context around each change", () => {
  const a = lines(20);
  const b = [...a];
  b[10] = "x";
  const items = foldRows(lineDiff(a.join("\n"), b.join("\n")).rows);
  assert.equal(shape(items), "fold7 s s s c s s s fold6");
  assert.deepEqual(items[0], { fold: true, start: 0, count: 7 });
  assert.equal(items[1].row.leftNo, 8);
});

test("a fold opens when its start is in the expanded set, and short runs never fold", () => {
  const a = lines(20);
  const b = [...a];
  b[10] = "x";
  const { rows } = lineDiff(a.join("\n"), b.join("\n"));
  assert.equal(shape(foldRows(rows, new Set([0]))), "s s s s s s s s s s c s s s fold6");
  const short = lineDiff("a\nb\nc\nd\nx", "a\nb\nc\nd\ny").rows;
  assert.equal(shape(foldRows(short)), "s s s s c");
});

test("identical texts do not fold, so an unchanged body still reads in full", () => {
  const text = lines(40).join("\n");
  assert.equal(foldRows(lineDiff(text, text).rows).filter((i) => i.fold).length, 0);
});

test("CRLF and LF line endings compare equal, and missing text is empty", () => {
  assert.equal(kinds(lineDiff("a\r\nb", "a\nb").rows), "same same");
  assert.equal(kinds(lineDiff(undefined, "a").rows), "changed");
  assert.equal(kinds(lineDiff(null, null).rows), "same");
});
