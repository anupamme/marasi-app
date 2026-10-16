// The Ledger's row context menu as data: what it offers for the selected
// pairs, and the text its Copy and Narrow query actions produce. Everything
// is computed from the pairs and the lists the app already holds, never
// fetched, so the menu opens at once. Plain functions, so they load under
// node; RowMenu.svelte renders the items and the Ledger page runs their
// actions.
//
// An item is one of:
//   "sep"                              a divider
//   { heading }                        a submenu heading
//   { id, label, icon, action?, sub?, actionId?, kbd?, disabled?, hint?,
//     checked?, badge?, severity? }
// `action` is { type, ...arguments } for the page to run on the selection.
// `actionId` names the keybinding catalog action whose keys the item shows.
// `icon` is a key into RowMenu.svelte's icon map.
import { LAUNCHPADS_EACH_MAX } from "../../stores/createLedgerStore.js";
import { upgradeFromLedgerRow, upgradePresentation } from "../websocket/presentation.js";
import { shortType } from "./table.js";

const plural = (n, one, many = one + "s") => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const unique = (values) => [...new Set(values)];

/** The pair's URL: scheme, host and path. */
export function pairURL(pair) {
  return `${pair.Scheme ?? "https"}://${pair.Host ?? ""}${pair.Path ?? ""}`;
}

// The path without its query string.
const pathOnly = (path) => String(path ?? "").split("?")[0];

// The folder a path sits in, as a wildcard: /v1/users/7 → /v1/users/*.
function pathFolder(path) {
  const clean = pathOnly(path);
  return clean.replace(/\/[^/]+$/, "/*") || "/*";
}

// A highlight key for comparing pairs: the number, or an older hex colour.
function highlightKey(pair) {
  if (pair?.Highlight >= 1) return `n${pair.Highlight}`;
  const hex = pair?.Metadata?.highlight;
  return typeof hex === "string" && hex ? hex.toLowerCase() : "";
}

const hasResponse = (pair) => Number(pair?.StatusCode) > 0;

const quote = (value) => JSON.stringify(String(value));

/**
 * Adds `term` to the query. A query with OR is grouped first, so the term
 * narrows all of it.
 */
export function narrowQuery(text, term) {
  const query = String(text ?? "").trim();
  if (!query) return term;
  const grouped = /\bOR\b/.test(query) ? `(${query})` : query;
  return `${grouped} AND ${term}`;
}

/** The header's summary: count, hosts, methods and status classes with counts. */
export function selectionSummary(pairs) {
  const methods = new Map();
  const classes = new Map();
  for (const pair of pairs) {
    methods.set(pair.Method, (methods.get(pair.Method) ?? 0) + 1);
    const status = Number(pair.StatusCode);
    if (status >= 100) {
      const key = `${Math.floor(status / 100)}xx`;
      classes.set(key, (classes.get(key) ?? 0) + 1);
    }
  }
  return {
    count: pairs.length,
    hosts: unique(pairs.map((pair) => pair.Host)),
    methods: [...methods],
    classes: [...classes].sort(([a], [b]) => (a < b ? -1 : 1)),
  };
}

/**
 * The IDs of `rows` that are like the chosen pairs: "host" (from their
 * hosts), "endpoint" (same method, host and path), "status", "highlight",
 * or "invert" (every row not chosen).
 */
export function similarIDs(kind, rows, chosen) {
  const hosts = new Set(chosen.map((pair) => pair.Host));
  const endpoints = new Set(chosen.map((pair) => `${pair.Method} ${pair.Host}${pathOnly(pair.Path)}`));
  const statuses = new Set(chosen.map((pair) => Number(pair.StatusCode) || 0));
  const highlights = new Set(chosen.map(highlightKey).filter(Boolean));
  const chosenIDs = new Set(chosen.map((pair) => String(pair.ID)));
  const test = {
    host: (row) => hosts.has(row.Host),
    endpoint: (row) => endpoints.has(`${row.Method} ${row.Host}${pathOnly(row.Path)}`),
    status: (row) => statuses.has(Number(row.StatusCode) || 0),
    highlight: (row) => highlights.has(highlightKey(row)),
    invert: (row) => !chosenIDs.has(String(row.ID)),
  }[kind];
  return test ? rows.filter(test).map((row) => String(row.ID)) : [];
}

/** A Markdown table of the pairs: number, method, URL and status. */
export function markdownTable(pairs, numberOf) {
  return [
    "| # | Method | URL | Status |",
    "|---|---|---|---|",
    ...pairs.map(
      (pair) =>
        `| ${numberOf(pair)} | ${pair.Method} | ${pairURL(pair)} | ${hasResponse(pair) ? pair.StatusCode : "—"} |`,
    ),
  ].join("\n");
}

const shellQuote = (text) => `'${String(text).replace(/'/g, `'\\''`)}'`;

/** A cURL command for the pair from its raw request. Host comes from the URL. */
export function curlCommand(pair, raw) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n");
  const split = text.indexOf("\n\n");
  const head = split < 0 ? text : text.slice(0, split);
  const body = split < 0 ? "" : text.slice(split + 2);
  const headers = head
    .split("\n")
    .slice(1)
    .filter((line) => line && !/^host:/i.test(line) && !/^content-length:/i.test(line));
  return [
    `curl -X ${pair.Method} ${shellQuote(pairURL(pair))}`,
    ...headers.map((line) => `  -H ${shellQuote(line)}`),
    ...(body ? [`  --data-raw ${shellQuote(body)}`] : []),
  ].join(" \\\n");
}

// Link state of a finding or test case over the pairs: true when every pair
// is linked, "mixed" when some are, false when none are.
function linkState(target, pairs) {
  const linked = new Set((target.Requests ?? []).map(String));
  const count = pairs.filter((pair) => linked.has(String(pair.ID))).length;
  return count === 0 ? false : count === pairs.length ? true : "mixed";
}

// The Finding and Test case submenus share a shape.
function linkMenu({ key, noun, pairs, one, n, targets, newActionId, newType, linkType, unlinkType }) {
  const states = targets.map((target) => [target, linkState(target, pairs)]);
  const linked = states.filter(([, state]) => state);
  const title = (target) => target.Title || `Untitled ${noun}`;
  return {
    badge: linked.length || null,
    sub: [
      {
        id: `${key}-new`,
        label: one ? `New ${noun} from this request` : `New ${noun} with ${n} requests`,
        icon: "plus",
        actionId: newActionId,
        action: { type: newType },
      },
      { heading: `Link to ${noun}` },
      ...(targets.length
        ? states.map(([target, checked]) => ({
            id: `${key}-${target.ID}`,
            label: title(target),
            icon: "link",
            severity: target.Severity,
            checked,
            action: { type: linkType, id: target.ID, title: title(target) },
          }))
        : [{ id: `${key}-none`, label: `No ${noun}s yet`, disabled: true }]),
      ...(linked.length
        ? [
            { heading: "Unlink" },
            ...linked.map(([target]) => ({
              id: `${key}u-${target.ID}`,
              label: title(target),
              icon: "unlink",
              action: { type: unlinkType, id: target.ID, title: title(target) },
            })),
          ]
        : []),
    ],
  };
}

/**
 * The menu for `pairs`, the selected pairs in table order. `context` holds
 * what the app already knows: { numberOf(pair), launchpads, findings,
 * testCases }.
 */
export function menuFor(pairs, { numberOf = () => "", launchpads = [], findings = [], testCases = [] } = {}) {
  const n = pairs.length;
  if (n === 0) return [];
  const one = n === 1 ? pairs[0] : null;
  const hosts = unique(pairs.map((pair) => pair.Host));
  const types = unique(pairs.map((pair) => pair.ContentType).filter(Boolean));
  const statuses = unique(pairs.map((pair) => Number(pair.StatusCode) || 0));
  const websocket = one && upgradePresentation(upgradeFromLedgerRow(one)).canOpen;
  const finding = linkMenu({
    key: "f",
    noun: "finding",
    pairs,
    one,
    n,
    targets: findings,
    newActionId: "ledger.drawer-open.create-finding",
    newType: "new-finding",
    linkType: "link-finding",
    unlinkType: "unlink-finding",
  });
  const testCase = linkMenu({
    key: "t",
    noun: "test case",
    pairs,
    one,
    n,
    targets: testCases,
    newActionId: "ledger.drawer-open.create-test-case",
    newType: "new-test-case",
    linkType: "link-test-case",
    unlinkType: "unlink-test-case",
  });

  return [
    {
      id: "open",
      label: one ? "Open in drawer" : `Open request ${numberOf(pairs[0])} in drawer`,
      icon: "open",
      kbd: "↵",
      action: { type: "open", id: pairs[0].ID },
    },
    ...(websocket
      ? [
          {
            id: "websocket",
            label: "Open WebSocket stream",
            icon: "radio",
            actionId: "ledger.drawer-open.websocket.open-stream",
            action: { type: "websocket", id: one.ID },
          },
        ]
      : []),
    "sep",
    {
      id: "launchpad",
      label: "Send to Launchpad",
      icon: "send",
      sub: [
        {
          id: "lp-new",
          label: one ? "New launchpad" : `New launchpad with ${n} entries`,
          icon: "plus",
          actionId: "ledger.drawer-open.send-to-launchpad",
          action: { type: "new-launchpad" },
        },
        ...(n > 1
          ? [
              {
                id: "lp-each",
                label: `${n} launchpads, one each`,
                disabled: n > LAUNCHPADS_EACH_MAX,
                hint: `Up to ${LAUNCHPADS_EACH_MAX} at a time`,
                action: { type: "launchpad-each" },
              },
            ]
          : []),
        { heading: "Add to launchpad" },
        ...(launchpads.length
          ? launchpads.map((launchpad) => ({
              id: `lp-${launchpad.ID}`,
              label: launchpad.Name || "Untitled launchpad",
              action: { type: "add-to-launchpad", id: launchpad.ID, name: launchpad.Name },
            }))
          : [{ id: "lp-none", label: "No launchpads yet", disabled: true }]),
      ],
    },
    {
      id: "armory",
      label: one ? "Send to Armory" : `Send ${n} to Armory`,
      icon: "swords",
      actionId: "ledger.drawer-open.send-to-armory",
      action: { type: "armory" },
    },
    "sep",
    { id: "finding", label: "Finding", icon: "finding", ...finding },
    { id: "testcase", label: "Test case", icon: "testcase", ...testCase },
    ...(one
      ? [
          {
            id: "note",
            label: one.Metadata?.has_note == 1 || one.Note ? "Edit note…" : "Add note…",
            icon: "pen",
            actionId: "ledger.drawer-open.view-note",
            action: { type: "note", id: one.ID },
          },
        ]
      : []),
    "sep",
    {
      id: "copy",
      label: "Copy",
      icon: "copy",
      sub: [
        {
          id: "c-url",
          label: one ? "URL" : `${n} URLs`,
          actionId: "ledger.drawer-open.copy-url",
          action: { type: "copy", what: "urls" },
        },
        { id: "c-curl", label: "As cURL", action: { type: "copy", what: "curl" } },
        {
          id: "c-req",
          label: one ? "Raw request" : `${n} raw requests`,
          actionId: "ledger.drawer-open.copy-raw-request",
          action: { type: "copy", what: "requests" },
        },
        {
          id: "c-res",
          label: one ? "Raw response" : `${n} raw responses`,
          actionId: "ledger.drawer-open.copy-raw-response",
          disabled: !pairs.some(hasResponse),
          hint: "No response yet",
          action: { type: "copy", what: "responses" },
        },
        { id: "c-md", label: "As Markdown table", action: { type: "copy", what: "markdown" } },
        { id: "c-numbers", label: "Request numbers", action: { type: "copy", what: "numbers" } },
      ],
    },
    {
      id: "narrow",
      label: "Narrow query",
      icon: "filter",
      sub: [
        { heading: "Query" },
        {
          id: "q-host",
          label: hosts.length === 1 ? `host = ${hosts[0]}` : `Only these ${hosts.length} hosts`,
          action: {
            type: "narrow",
            term:
              hosts.length === 1
                ? `host = ${quote(hosts[0])}`
                : `(${hosts.map((host) => `host = ${quote(host)}`).join(" OR ")})`,
          },
        },
        ...hosts.slice(0, 3).map((host) => ({
          id: `q-not-host-${host}`,
          label: `host != ${host}`,
          action: { type: "narrow", term: `host != ${quote(host)}` },
        })),
        ...(one
          ? [
              {
                id: "q-path",
                label: `path = ${pathFolder(one.Path)}`,
                action: { type: "narrow", term: `path = ${quote(pathFolder(one.Path))}` },
              },
            ]
          : []),
        ...(statuses.length === 1 && statuses[0]
          ? [
              {
                id: "q-status",
                label: `status_code = ${statuses[0]}`,
                action: { type: "narrow", term: `status_code = ${statuses[0]}` },
              },
            ]
          : []),
        ...(types.length ? [{ heading: "Types" }] : []),
        ...types.slice(0, 3).map((type) => ({
          id: `x-${type}`,
          label: `Hide ${shortType(type)} (${type})`,
          icon: "eye-off",
          action: { type: "hide-type", contentType: type },
        })),
      ],
    },
    {
      id: "select",
      label: "Select",
      icon: "select",
      sub: [
        {
          id: "s-host",
          label: hosts.length === 1 ? `All from ${hosts[0]}` : `All from these ${hosts.length} hosts`,
          action: { type: "select", kind: "host" },
        },
        {
          id: "s-endpoint",
          label: "Same endpoint (method + path)",
          action: { type: "select", kind: "endpoint" },
        },
        {
          id: "s-status",
          label:
            statuses.length === 1 ? `All with status ${statuses[0] || "pending"}` : "Same statuses",
          action: { type: "select", kind: "status" },
        },
        ...(one && highlightKey(one)
          ? [
              {
                id: "s-highlight",
                label: "All with this highlight",
                action: { type: "select", kind: "highlight" },
              },
            ]
          : []),
        { id: "s-invert", label: "Invert selection", action: { type: "select", kind: "invert" } },
      ],
    },
    "sep",
    {
      id: "metadata",
      label: "Metadata…",
      icon: "braces",
      actionId: "ledger.drawer-open.view-metadata",
      disabled: !one,
      hint: "One request at a time",
      action: { type: "metadata", id: pairs[0].ID },
    },
  ];
}

const isAction = (item) => item && item !== "sep" && !item.heading;

/**
 * Every action whose label or submenu path contains `text`, ignoring case,
 * flattened with its path as `trail`. Blank text returns the menu as is.
 */
export function filterMenu(items, text) {
  const needle = String(text ?? "").trim().toLowerCase();
  if (!needle) return items;
  const out = [];
  const walk = (list, trail) => {
    for (const item of list) {
      if (!isAction(item)) continue;
      if (item.sub) walk(item.sub, [...trail, item.label]);
      else if ([...trail, item.label].join(" ").toLowerCase().includes(needle)) {
        out.push({ ...item, trail });
      }
    }
  };
  walk(items, []);
  return out;
}

/** Leaves of `items` that can run: not separators, headings or disabled. */
export function isRunnable(item) {
  return isAction(item) && !item.disabled;
}

/** Plural helper for the page's toasts: "1 request", "3 requests". */
export function requestCount(n) {
  return plural(n, "request");
}
