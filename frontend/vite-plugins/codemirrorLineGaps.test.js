import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import codemirrorLineGaps, { patchLineGaps } from "./codemirrorLineGaps.js";

const installed = readFileSync(fileURLToPath(import.meta.resolve("@codemirror/view")), "utf8");

// The ViewState constructor's first line gaps, as CodeMirror ships them and
// as the patch leaves them.
const SHIPPED = "this.lineGapDeco = Decoration.set(this.lineGaps.map(gap => gap.draw(this, false)));";
const FIXED = "this.lineGapDeco = Decoration.set(this.lineGaps.map(gap => gap.draw(this, this.heightOracle.lineWrapping)));";

test("the installed CodeMirror draws a new editor's first line gaps as unwrapped", () => {
  assert.ok(installed.includes(SHIPPED));
});

test("patched, a new wrapping editor draws its first line gaps as wrapped", () => {
  const patched = patchLineGaps(installed);
  assert.ok(patched.includes(FIXED));
  assert.ok(!patched.includes("gap.draw(this, false)"));
});

// A CodeMirror upgrade that rewrites the constructor must not drop the fix
// silently: the build stops and names the file to recheck.
test("a CodeMirror without the shipped line stops the build", () => {
  assert.throws(() => patchLineGaps("export class EditorView {}"), /@codemirror\/view/);
});

test("vite build patches @codemirror/view and leaves other modules alone", () => {
  const plugin = codemirrorLineGaps();
  const id = fileURLToPath(import.meta.resolve("@codemirror/view"));
  assert.ok(plugin.transform(installed, id).code.includes(FIXED));
  assert.equal(plugin.transform("const a = 1;", fileURLToPath(import.meta.resolve("@codemirror/state"))), null);
});

test("vite dev's pre-bundled CodeMirror is patched too", async () => {
  const { optimizeDeps } = codemirrorLineGaps().config();
  const result = await build({
    stdin: { contents: 'export * from "@codemirror/view";', resolveDir: process.cwd() },
    bundle: true,
    write: false,
    format: "esm",
    logLevel: "silent",
    plugins: optimizeDeps.esbuildOptions.plugins,
  });
  const out = result.outputFiles[0].text;
  assert.ok(out.includes("gap.draw(this, this.heightOracle.lineWrapping)"));
  assert.ok(!out.includes("gap.draw(this, false)"));
});
