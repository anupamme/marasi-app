// Patches @codemirror/view (6.36 through at least 6.43.14) so a new editor
// that wraps lines draws its first line gaps as wrapped.
//
// The ViewState constructor draws the gaps that hide most of a very long line
// with `gap.draw(this, false)`: as an inline block as wide as the hidden text
// is tall (about 250,000 px for a 550 KB line). The editor's first measure
// reads that width as its content width, takes the line to be one row high,
// drops the gaps and draws the whole line; laying out 550 KB of wrapped text
// without spaces blocks WebKit for about 3 s. Every later redraw already passes
// the editor's own wrapping, which is what the patch passes here too.
//
// Vite build reads the module through `transform`; Vite dev pre-bundles it with
// esbuild, so the same patch runs there as an esbuild plugin.
import { readFile } from "node:fs/promises";

const SHIPPED = /gap => gap\.draw\(this, false\)/g;
const VIEW_MODULE = /[\\/]@codemirror[\\/]view[\\/]dist[\\/]index\.js$/;

/** `source`, @codemirror/view's module, with a new editor's first line gaps drawn for its wrapping. */
export function patchLineGaps(source) {
  const matches = source.match(SHIPPED)?.length ?? 0;
  if (matches !== 1) {
    throw new Error(
      `codemirrorLineGaps: expected 1 "gap.draw(this, false)" in @codemirror/view, found ${matches}; recheck the ViewState constructor`,
    );
  }
  return source.replace(SHIPPED, "gap => gap.draw(this, this.heightOracle.lineWrapping)");
}

const esbuildPlugin = {
  name: "codemirror-line-gaps",
  setup(build) {
    build.onLoad({ filter: VIEW_MODULE }, async ({ path }) => ({
      contents: patchLineGaps(await readFile(path, "utf8")),
      loader: "js",
    }));
  },
};

/** The Vite plugin. */
export default function codemirrorLineGaps() {
  return {
    name: "codemirror-line-gaps",
    enforce: "pre",
    config: () => ({ optimizeDeps: { esbuildOptions: { plugins: [esbuildPlugin] } } }),
    transform(code, id) {
      if (!VIEW_MODULE.test(id.split("?")[0])) return null;
      return { code: patchLineGaps(code), map: null };
    },
  };
}
