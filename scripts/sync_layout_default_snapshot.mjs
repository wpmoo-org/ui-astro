// Regenerates tests/fixtures/layout-default from the SDK at a given commit.
// Usage: node scripts/sync_layout_default_snapshot.mjs <commit>
// The script extracts `git archive <commit>` into a temporary directory and
// renders from there. The extraction gets its own node_modules folder: every
// entry of the repository node_modules is linked into it except @wpmoo,
// because the repository's @wpmoo/astro and @wpmoo/astro-demo are relative
// workspace links and would resolve to the working tree, not to <commit>.
// Inside @wpmoo, workspace links are recreated relative to the extraction (so
// they point at its own packages/astro and apps/demo) and installed packages
// such as @wpmoo/ui link to the installed copy. Before rendering, the script
// resolves @wpmoo/astro from the extraction and fails if its real path lies
// outside the extraction.
// Snapshots are the normalized output with trailing whitespace stripped per
// line (stripLineEnds), so they are not byte-identical to it.
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRenderer } from "../tests/helpers/render-astro.mjs";
import { layoutCases } from "../tests/helpers/layout-cases.mjs";
import { normalizeHtml, stripLineEnds } from "../tests/helpers/site-header-normalize.mjs";

const [commit, ...rest] = process.argv.slice(2);
if (!commit || rest.length) throw new Error("usage: sync_layout_default_snapshot.mjs <commit>");
const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const out = join(repository, "tests/fixtures/layout-default/");
const inside = (path, root) => path === root || path.startsWith(root + sep);

// Links node_modules entries of the repository into the extraction, keeping
// @wpmoo workspace links inside the extraction.
async function linkModules(tree) {
  const source = join(repository, "node_modules");
  const target = join(tree, "node_modules");
  await mkdir(join(target, "@wpmoo"), { recursive: true });
  for (const name of await readdir(source)) {
    if (name !== "@wpmoo") await symlink(join(source, name), join(target, name));
  }
  for (const name of await readdir(join(source, "@wpmoo"))) {
    const entry = join(source, "@wpmoo", name);
    const real = await realpath(entry);
    const workspace = (await lstat(entry)).isSymbolicLink() && inside(real, repository)
      && !inside(real, source);
    if (workspace) {
      const link = await readlink(entry);
      const local = resolve(dirname(join(target, "@wpmoo", name)), link);
      if (!inside(local, tree)) throw new Error(`@wpmoo/${name} links outside the extraction: ${link}`);
      await symlink(link, join(target, "@wpmoo", name));
    } else {
      await symlink(real, join(target, "@wpmoo", name));
    }
  }
}

async function assertSdkFromTree(tree) {
  const require = createRequire(join(tree, "package.json"));
  const entry = await realpath(require.resolve("@wpmoo/astro"));
  if (!inside(entry, tree)) {
    throw new Error(`@wpmoo/astro resolves to ${entry}, outside the extraction ${tree}`);
  }
}

const tree = await realpath(await mkdtemp(join(tmpdir(), "layout-default-")));
try {
  const archive = execFileSync("git", ["-C", repository, "archive", "--format=tar", `${commit}^{commit}`], {
    maxBuffer: 512 * 1024 * 1024,
  });
  execFileSync("tar", ["-x", "-C", tree], { input: archive });
  await linkModules(tree);
  await assertSdkFromTree(tree);
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
  console.log(`wrote ${Object.keys(layoutCases).length} snapshots for ${commit} (rendered from ${relative(tmpdir(), tree)})`);
} finally {
  await rm(tree, { recursive: true, force: true });
}
