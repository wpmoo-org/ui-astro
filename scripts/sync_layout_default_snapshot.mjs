// Regenerates tests/fixtures/layout-default from a given SDK tree.
// Usage: node scripts/sync_layout_default_snapshot.mjs <tree-root> <commit>
// To record HEAD output, extract `git archive <commit>` into a directory,
// symlink the repository node_modules into it, and pass that directory.
// Snapshots are the normalized output with trailing whitespace stripped per
// line (stripLineEnds), so they are not byte-identical to it.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRenderer } from "../tests/helpers/render-astro.mjs";
import { layoutCases } from "../tests/helpers/layout-cases.mjs";
import { normalizeHtml, stripLineEnds } from "../tests/helpers/site-header-normalize.mjs";

const [tree, commit] = process.argv.slice(2);
if (!tree || !commit) throw new Error("usage: sync_layout_default_snapshot.mjs <tree-root> <commit>");
const out = fileURLToPath(new URL("../tests/fixtures/layout-default/", import.meta.url));
await mkdir(out, { recursive: true });
const renderer = await createRenderer(tree);
try {
  for (const [name, options] of Object.entries(layoutCases)) {
    const html = await renderer.render("layouts/Layout.astro", options);
    await writeFile(`${out}${name}.html`, stripLineEnds(normalizeHtml(html)));
  }
} finally {
  await renderer.close();
}
await writeFile(`${out}source.json`, `${JSON.stringify({ commit, cases: Object.keys(layoutCases) }, null, 2)}\n`);
console.log(`wrote ${Object.keys(layoutCases).length} snapshots for ${commit}`);
