// A host page that imports SDK server APIs in plain JS (context, seo) must
// build in a prerendered site. Astro 7 builds prerendered pages in its own
// "prerender" Vite environment, which does not inherit ssr.noExternal; left
// external, the SDK loads in plain Node and its virtual: imports fail
// (ERR_UNSUPPORTED_ESM_URL_SCHEME). moo() names the SDK noExternal there too,
// merged with host settings, and leaves the client and ssr settings as they were.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import moo from "../packages/astro/src/integration/index.js";

const sdk = fileURLToPath(new URL("../", import.meta.url));
const site = "https://example.test";
let root;
let result;

async function write(name, text) {
  const path = join(root, name);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
}

// The vite part of every updateConfig payload from astro:config:setup.
function vitePayloads(command) {
  const updates = [];
  moo({ plugins: [] }).hooks["astro:config:setup"]({
    command,
    config: { root: new URL("../apps/consumer/", import.meta.url), vite: {} },
    injectRoute() {},
    addMiddleware() {},
    updateConfig(value) {
      updates.push(value);
    },
  });
  return updates.map((value) => value.vite).filter(Boolean);
}

test("moo() keeps ssr.noExternal as it was and sets no client options", () => {
  for (const command of ["dev", "build", "sync"]) {
    const ssr = vitePayloads(command).filter((vite) => "ssr" in vite).map((vite) => vite.ssr);
    assert.deepEqual(ssr, [{ noExternal: ["@wpmoo/astro"] }], command);
    for (const vite of vitePayloads(command)) {
      assert.equal(vite.environments?.client, undefined, command);
      assert.equal(vite.environments?.ssr, undefined, command);
      assert.equal(vite.build, undefined, command);
    }
  }
});

test("moo() names the SDK noExternal in the prerender environment only", () => {
  for (const command of ["dev", "build", "sync"]) {
    const environments = vitePayloads(command).filter((vite) => "environments" in vite).map((vite) => vite.environments);
    assert.deepEqual(environments, [{ prerender: { resolve: { noExternal: ["@wpmoo/astro"] } } }], command);
  }
});

// A temporary host with its own copy of the SDK in node_modules; a symlinked
// workspace package would never be externalized and would hide the bug.
before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "moo-prerender-import-")));
  await mkdir(join(root, "node_modules/@wpmoo"), { recursive: true });
  for (const name of await readdir(join(sdk, "node_modules"))) {
    if (name === "@wpmoo") continue;
    await symlink(join(sdk, "node_modules", name), join(root, "node_modules", name));
  }
  await symlink(join(sdk, "node_modules/@wpmoo/ui"), join(root, "node_modules/@wpmoo/ui"));
  await cp(join(sdk, "packages/astro"), join(root, "node_modules/@wpmoo/astro"), {
    recursive: true,
    filter: (path) => !path.includes("/node_modules"),
  });
  await write("package.json", JSON.stringify({ private: true, type: "module" }));
  // Host vite settings that moo() must keep, and an integration after moo()
  // that records the resolved settings.
  await write("astro.config.mjs", `
import { writeFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
const record = { name: "record-vite", hooks: { "astro:config:done": ({ config }) => {
  const { ssr, environments } = config.vite;
  writeFileSync(new URL("./resolved-vite.json", config.root), JSON.stringify({ ssr, environments }));
} } };
export default defineConfig({ site: "${site}", trailingSlash: "always", cacheDir: "./.astro-cache",
  vite: { ssr: { noExternal: ["host-ssr"] }, environments: { prerender: { resolve: { noExternal: ["host-prerender"] } }, client: { resolve: { dedupe: ["host-client"] } } } },
  integrations: [moo({ plugins: [page()], site: { brand: "Fixture Brand", seo: { sitemap: false, robots: false } } }), record] });`);
  // An active site (the Page plugin), as hosts run it; the site context
  // exists only on an active site.
  await write("src/content.config.ts", `
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
export const collections = { page: defineCollection({ loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: pageSchema }) };`);
  await write("src/content/page/about.md", "---\ntitle: About\nslug: about\nstatus: publish\n---\nBody.");
  await write("src/pages/host.astro", `---
import { getSiteContext } from "@wpmoo/astro/context";
import { resolveSeoMetadata } from "@wpmoo/astro/seo";
const { site } = getSiteContext();
const metadata = resolveSeoMetadata(site, { title: "Seo Title", url: new URL("/host/", Astro.site).href, status: "publish", type: "page", view: "single" });
---
<html lang="en"><head><title>{metadata.title}</title></head><body><p data-brand={site.brand} data-canonical={metadata.canonical}>Body</p></body></html>`);
  result = spawnSync(join(sdk, "node_modules/.bin/astro"), ["build"], { cwd: root, encoding: "utf8" });
});

after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

test("a prerendered host page with plain JS imports from context and seo builds", async () => {
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const html = await readFile(join(root, "dist/host/index.html"), "utf8");
  assert.match(html, /data-brand="Fixture Brand"/u);
  assert.match(html, new RegExp(`data-canonical="${site}/host/"`, "u"));
  assert.match(html, /<title>Seo Title/u);
});

test("host vite settings are kept beside the SDK entries", async () => {
  const resolved = JSON.parse(await readFile(join(root, "resolved-vite.json"), "utf8"));
  assert.deepEqual(resolved.ssr.noExternal, ["host-ssr", "@wpmoo/astro"]);
  assert.deepEqual(resolved.environments.prerender.resolve.noExternal, ["host-prerender", "@wpmoo/astro"]);
  assert.deepEqual(resolved.environments.client, { resolve: { dedupe: ["host-client"] } });
  assert.equal(resolved.environments.ssr, undefined);
});
