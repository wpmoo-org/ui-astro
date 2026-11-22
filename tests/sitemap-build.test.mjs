// Builds a small host site and checks sitemap.xml and robots.txt against the
// built pages in both directions: every listed URL is a built page that names
// itself as canonical without noindex, and every such page is listed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";

const sdk = fileURLToPath(new URL("../", import.meta.url));
const site = "https://example.test";
let root;

const config = ({ withSite = true, seo = "" } = {}) => `
import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
export default defineConfig({ ${withSite ? `site: "${site}",` : ""} base: "/docs", trailingSlash: "always", cacheDir: "./.astro-cache",
  i18n: { locales: ["en", "de"], defaultLocale: "en", routing: { prefixDefaultLocale: false } },
  integrations: [moo({ site: { brand: "Fixture", organization: { name: "Fixture" }${seo ? `, seo: ${seo}` : ""} }, plugins: [page()] })] });`;

async function write(name, text) {
  const path = join(root, name);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
}
async function remove(name) {
  await rm(join(root, name), { force: true, recursive: true });
}
function build() {
  return spawnSync(join(sdk, "node_modules/.bin/astro"), ["build"], { cwd: root, encoding: "utf8" });
}
async function htmlFiles(dir, prefix = "") {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) found.push(...(await htmlFiles(join(dir, entry.name), `${relative}/`)));
    else if (entry.name.endsWith(".html")) found.push(relative);
  }
  return found;
}

before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "moo-sitemap-build-")));
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
  await write("astro.config.mjs", config());
  await write(
    "src/content.config.ts",
    `
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
export const collections = { page: defineCollection({ loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: pageSchema }) };`,
  );
  const entry = (locale, slug, extra = "") =>
    write(`src/content/page/${locale}/${slug}.md`, `---\ntitle: ${slug}\nslug: ${slug}\nstatus: publish\nlocale: ${locale}\ntranslationKey: ${slug}\n${extra}---\nBody.`);
  await entry("en", "index");
  await entry("de", "index");
  await entry("en", "contact", "updated_at: \"2026-02-03T04:05:06+01:00\"\n");
  await entry("de", "contact");
  await entry("en", "only-en");
  await entry("en", "hidden", "seo:\n  noindex: true\n");
  await write("src/content/page/en/draft.md", "---\ntitle: Draft\nslug: draft\nstatus: draft\nlocale: en\ntranslationKey: draft\n---\nBody.");
  // Host pages: a copy naming another canonical, a page without a canonical,
  // and a self-canonical page with reordered attributes and a JSON-LD @graph.
  await write("src/pages/copy.astro", `<html><head><link rel="canonical" href="${site}/docs/contact/"></head><body>Copy</body></html>`);
  await write("src/pages/plain.astro", "<html><head><title>Plain</title></head><body>Plain</body></html>");
  await write(
    "src/pages/raw.astro",
    `---\nconst data = { "@graph": [{ "@type": "WebPage", url: "${site}/docs/raw/", datePublished: "2026-05-06" }] };\n---\n<html><head><link href="${site}/docs/raw/" rel="canonical"><script type="application/ld+json" set:html={JSON.stringify(data)} /></head><body>Raw</body></html>`,
  );
});

after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

test("sitemap.xml lists exactly the built self-canonical pages without noindex", async () => {
  const result = build();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const dist = join(root, "dist");
  const expected = new Set();
  for (const file of await htmlFiles(dist)) {
    const html = await readFile(join(dist, file), "utf8");
    const self = `${site}/docs/${file.replace(/index\.html$/u, "")}`;
    const canonical = html.match(/<link[^>]*rel="canonical"[^>]*>/u)?.[0].match(/href="([^"]+)"/u)?.[1];
    if (canonical === self && !/<meta name="robots" content="[^"]*noindex/u.test(html)) expected.add(self);
  }
  const xml = await readFile(join(dist, "sitemap.xml"), "utf8");
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
  assert.deepEqual(new Set(listed), expected);
  assert.equal(listed.length, expected.size);
  for (const url of ["/docs/", "/docs/de/", "/docs/contact/", "/docs/de/contact/", "/docs/only-en/", "/docs/raw/"])
    assert.ok(expected.has(`${site}${url}`), url);
  for (const url of ["/docs/hidden/", "/docs/draft/", "/docs/copy/", "/docs/plain/", "/docs/404/"])
    assert.ok(!listed.includes(`${site}${url}`), url);
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/u);
  assert.match(
    xml,
    /<url><loc>https:\/\/example\.test\/docs\/contact\/<\/loc><lastmod>2026-02-03T03:05:06\.000Z<\/lastmod><xhtml:link rel="alternate" hreflang="en" href="https:\/\/example\.test\/docs\/contact\/"\/><xhtml:link rel="alternate" hreflang="de" href="https:\/\/example\.test\/docs\/de\/contact\/"\/><\/url>/u,
  );
  assert.match(xml, /<url><loc>https:\/\/example\.test\/docs\/raw\/<\/loc><lastmod>2026-05-06<\/lastmod><\/url>/u);
  assert.equal(
    await readFile(join(dist, "robots.txt"), "utf8"),
    `User-agent: *\nAllow: /\n\nSitemap: ${site}/docs/sitemap.xml\n`,
  );
});

test("a host robots.txt, a host sitemap route or a missing site fail the build", async () => {
  await write("public/robots.txt", "User-agent: *\n");
  let result = build();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /public\/robots\.txt also provides it.*seo: \{ robots: false \}/u);
  await remove("public");

  await write("src/pages/sitemap.xml.ts", "export const GET = () => new Response('<urlset/>');");
  result = build();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /writes sitemap\.xml at build, and the route \/sitemap\.xml/u);
  await remove("src/pages/sitemap.xml.ts");

  await write("astro.config.mjs", config({ withSite: false }));
  result = build();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /needs the Astro `site`.*seo: \{ sitemap: false \}/u);

  await write("astro.config.mjs", config({ withSite: false, seo: '{ sitemap: false, robots: { disallow: ["/docs/intern/"] } }' }));
  result = build();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  await assert.rejects(readFile(join(root, "dist/sitemap.xml")), /ENOENT/u);
  assert.equal(await readFile(join(root, "dist/robots.txt"), "utf8"), "User-agent: *\nAllow: /\nDisallow: /docs/intern/\n");
});
