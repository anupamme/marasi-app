// Side-by-side line diff for comparing two launchpad entries.
//
// Myers' O((N+M)·D) algorithm over the lines left after trimming the common
// prefix and suffix. Each row pairs a left and a right line; a run of
// removed and added lines is zipped into "changed" rows so the two sides
// line up, and the leftovers stay "removed" or "added".

const splitLines = (text) => (text ?? "").split(/\r?\n/);

// Edit budget: past this many inserted plus removed lines the bodies are
// too different to align usefully, and the trace would cost O(D²) memory.
export const MAX_EDITS = 2000;

/**
 * Myers' shortest edit script from a to b, as ops in order: "=" keep,
 * "-" remove from a, "+" add from b. Null when it needs more than maxEdits.
 */
function editScript(a, b, maxEdits) {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, maxEdits);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] is v over k in -d..d before step d, indexed k + d.
  const trace = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d += 1) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
          ? v[offset + k + 1]
          : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;

  const ops = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d -= 1) {
    const snap = trace[d];
    const k = x - y;
    const down = k === -d || (k !== d && snap[k - 1 + d] < snap[k + 1 + d]);
    const prevK = down ? k + 1 : k - 1;
    const prevX = snap[prevK + d];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push("=");
      x -= 1;
      y -= 1;
    }
    ops.push(down ? "+" : "-");
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    ops.push("=");
    x -= 1;
    y -= 1;
  }
  return ops.reverse();
}

/**
 * Rows of { kind: "same" | "changed" | "removed" | "added", left, right,
 * leftNo, rightNo }; a missing side is null. `approximate` is true when the
 * edit budget ran out and the differing middle is shown as one replaced block.
 */
export function lineDiff(leftText, rightText, maxEdits = MAX_EDITS) {
  const left = splitLines(leftText);
  const right = splitLines(rightText);

  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let endL = left.length;
  let endR = right.length;
  while (endL > start && endR > start && left[endL - 1] === right[endR - 1]) {
    endL -= 1;
    endR -= 1;
  }
  const midL = left.slice(start, endL);
  const midR = right.slice(start, endR);
  let ops = editScript(midL, midR, maxEdits);
  const approximate = ops === null;
  if (approximate) ops = [...midL.map(() => "-"), ...midR.map(() => "+")];

  const rows = [];
  const row = (kind, li, ri) =>
    rows.push({
      kind,
      left: li === null ? null : left[li],
      right: ri === null ? null : right[ri],
      leftNo: li === null ? null : li + 1,
      rightNo: ri === null ? null : ri + 1,
    });

  let removed = [];
  let added = [];
  const flush = () => {
    const paired = Math.min(removed.length, added.length);
    for (let p = 0; p < paired; p += 1) row("changed", removed[p], added[p]);
    for (let p = paired; p < removed.length; p += 1) row("removed", removed[p], null);
    for (let p = paired; p < added.length; p += 1) row("added", null, added[p]);
    removed = [];
    added = [];
  };

  for (let p = 0; p < start; p += 1) row("same", p, p);
  let i = start;
  let j = start;
  for (const op of ops) {
    if (op === "=") {
      flush();
      row("same", i, j);
      i += 1;
      j += 1;
    } else if (op === "-") {
      removed.push(i);
      i += 1;
    } else {
      added.push(j);
      j += 1;
    }
  }
  flush();
  for (; i < left.length; i += 1, j += 1) row("same", i, j);
  return { rows, approximate };
}

/**
 * Folds unchanged runs, keeping `context` lines next to each change. Items
 * are { row } or { fold: true, start, count }, where `start` indexes `rows`;
 * a fold whose start is in `expanded` stays open. Nothing folds when the
 * texts are identical, and a fold always hides at least two lines.
 */
export function foldRows(rows, expanded = new Set(), context = 3) {
  if (!rows.some((row) => row.kind !== "same")) return rows.map((row) => ({ row }));
  const items = [];
  let index = 0;
  while (index < rows.length) {
    if (rows[index].kind !== "same") {
      items.push({ row: rows[index] });
      index += 1;
      continue;
    }
    let end = index;
    while (end < rows.length && rows[end].kind === "same") end += 1;
    const keepBefore = index === 0 ? 0 : context;
    const keepAfter = end === rows.length ? 0 : context;
    const start = index + keepBefore;
    const count = end - keepAfter - start;
    for (let p = index; p < end; p += 1) {
      if (count >= 2 && p === start && !expanded.has(start)) {
        items.push({ fold: true, start, count });
        p += count - 1;
      } else {
        items.push({ row: rows[p] });
      }
    }
    index = end;
  }
  return items;
}
