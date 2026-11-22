// Builds a host site that owns its error pages (notFound.routeOwner "host")
// under a base, with i18n, and checks that the SDK Layout and SiteLayout write
// exactly one robots noindex meta and no JSON-LD on every error page (404 and
// 500, plain and locale-prefixed), that a normal page is unchanged, and that
// the sitemap leaves the error pages out by the same rule.
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
let result;
let baseRoot;
let baseResult;

async function write(name, text, dir = root) {
  const path = join(dir, name);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
}

// A temporary host with its own copy of the SDK in node_modules.
async function host(prefix) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  await mkdir(join(dir, "node_modules/@wpmoo"), { recursive: true });
  for (const name of await readdir(join(sdk, "node_modules"))) {
    if (name === "@wpmoo") continue;
    await symlink(join(sdk, "node_modules", name), join(dir, "node_modules", name));
  }
  await symlink(join(sdk, "node_modules/@wpmoo/ui"), join(dir, "node_modules/@wpmoo/ui"));
  await cp(join(sdk, "packages/astro"), join(dir, "node_modules/@wpmoo/astro"), {
    recursive: true,
    filter: (path) => !path.includes("/node_modules"),
  });
  await write("package.json", JSON.stringify({ private: true, type: "module" }), dir);
  return dir;
}
const astroBuild = (dir) => spawnSync(join(sdk, "node_modules/.bin/astro"), ["build"], { cwd: dir, encoding: "utf8" });

// A host page on the SDK Layout with metadata that would be indexable and
// carry JSON-LD; only the error-page rule may turn it off.
const layoutPage = (path, lang = "en", props = "") => `---
import Layout from "@wpmoo/astro/Layout.astro";
const canonical = "${site}/docs${path}";
const metadata = { title: "Page", canonical, openGraph: { url: canonical }, twitter: {}, jsonLd: { "@context": "https://schema.org", "@type": "WebPage", url: canonical } };
---
<Layout title="Page" lang="${lang}" metadata={metadata}${props}><p>Body</p></Layout>`;

before(async () => {
  root = await host("moo-error-page-build-");
  await write("astro.config.mjs", `
import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
export default defineConfig({ site: "${site}", base: "/docs", trailingSlash: "always", cacheDir: "./.astro-cache",
  i18n: { locales: ["en", "de"], defaultLocale: "en", routing: { prefixDefaultLocale: false } },
  integrations: [moo({ plugins: [page()], site: { brand: "Fixture", organization: { name: "Fixture" } }, notFound: { routeOwner: "host" } })] });`);
  // An active site (the Page plugin with a home per locale), as hosts run it.
  await write("src/content.config.ts", `
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
export const collections = { page: defineCollection({ loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: pageSchema }) };`);
  for (const locale of ["en", "de"])
    await write(`src/content/page/${locale}/index.md`, `---\ntitle: Home\nslug: index\nstatus: publish\nlocale: ${locale}\ntranslationKey: index\n---\nBody.`);
  // Host-owned errors on Layout without noindex, one 500 with noindex={false},
  // and the German 404 shaped like a theme Shell: SiteLayout with page options
  // from the site context and indexable resolved metadata, no noindex prop.
  await write("src/pages/404.astro", layoutPage("/404/"));
  await write("src/pages/de/404.astro", `---
import SiteLayout from "@wpmoo/astro/layouts/SiteLayout.astro";
import { resolvePageOptions } from "@wpmoo/astro/config";
import { getSiteContext } from "@wpmoo/astro/context";
import { resolveSeoMetadata } from "@wpmoo/astro/seo";
const href = "/docs/de/404/";
const { site } = getSiteContext();
const options = resolvePageOptions(site, "page", "single", undefined, "de");
const metadata = resolveSeoMetadata(site, { title: "Nicht gefunden", url: new URL(href, Astro.site).href, status: "publish", type: "page", view: "single", lang: options.lang });
---
<SiteLayout title="Nicht gefunden" options={options} href={href} metadata={metadata} pageContext={{ view: "native", key: "not-found" }}><p>Fehlt</p></SiteLayout>`);
  await write("src/pages/500.astro", layoutPage("/500/", "en", " noindex={false}"));
  // /de/500 from a dynamic route: Astro gives it status 200, so only the
  // path marks it.
  await write("src/pages/[locale]/500.astro", `---
import Layout from "@wpmoo/astro/Layout.astro";
export const getStaticPaths = () => [{ params: { locale: "de" } }];
const canonical = "${site}/docs/de/500/";
const metadata = { title: "Fehler", canonical, openGraph: { url: canonical }, twitter: {}, jsonLd: { "@context": "https://schema.org", "@type": "WebPage", url: canonical } };
---
<Layout title="Fehler" lang="de" metadata={metadata}><p data-current-locale={Astro.currentLocale} data-status={Astro.response.status}>Fehler</p></Layout>`);
  // Normal pages, one whose last segment is 404 but is no error page.
  await write("src/pages/about.astro", layoutPage("/about/"));
  await write("src/pages/blog/404.astro", layoutPage("/blog/404/"));
  await write("src/pages/hidden.astro", layoutPage("/hidden/", "en", " noindex"));
  result = astroBuild(root);
});

after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  if (baseRoot) await rm(baseRoot, { recursive: true, force: true });
});

const built = (file) => readFile(join(root, "dist", file), "utf8");
const robotsOf = (html) => html.match(/<meta name="robots"[^>]*>/gu) ?? [];
const noindex = ['<meta name="robots" content="noindex, follow">'];

test("host-owned error pages on Layout and SiteLayout write one robots meta and no JSON-LD", async () => {
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const dynamic = await built("de/500/index.html");
  assert.match(dynamic, /data-status="200"/u);
  for (const file of ["404.html", "de/404/index.html", "500.html", "de/500/index.html"]) {
    const html = await built(file);
    assert.deepEqual(robotsOf(html), noindex, file);
    assert.equal(html.includes("application/ld+json"), false, file);
    // The robots meta is the one slice 1 writes right after <title>.
    assert.match(html, /<\/title><meta name="robots" content="noindex, follow">/u, file);
  }
});

test("normal pages are unchanged; an explicit noindex still writes one meta", async () => {
  assert.equal(result.status, 0, result.stderr + result.stdout);
  for (const file of ["about/index.html", "blog/404/index.html"]) {
    const html = await built(file);
    assert.deepEqual(robotsOf(html), [], file);
    assert.equal(html.includes("application/ld+json"), true, file);
  }
  const hidden = await built("hidden/index.html");
  assert.deepEqual(robotsOf(hidden), noindex);
  assert.equal(hidden.includes("application/ld+json"), false);
});

test("the sitemap lists the normal pages and none of the error pages", async () => {
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const xml = await built("sitemap.xml");
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
  for (const path of ["/", "/about/", "/blog/404/"]) assert.ok(listed.includes(`${site}/docs${path}`), path);
  for (const path of ["/404/", "/de/404/", "/500/", "/de/500/", "/hidden/"])
    assert.ok(!listed.includes(`${site}/docs${path}`), path);
});

// Base /en with locales en and de: a rest route renders /en/de/500/ with
// Astro.currentLocale en and status 200, so Layout must check every configured
// locale, the set the sitemap callers pass, not Astro.currentLocale alone.
test("a locale-named base still marks /de/500 from a rest route", async () => {
  baseRoot = await host("moo-error-page-base-");
  await write("astro.config.mjs", `
import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
export default defineConfig({ site: "${site}", base: "/en", trailingSlash: "always", cacheDir: "./.astro-cache",
  i18n: { locales: ["en", "de"], defaultLocale: "en", routing: { prefixDefaultLocale: false } },
  integrations: [moo({ plugins: [], site: { brand: "Fixture", seo: { sitemap: false, robots: false } }, notFound: { routeOwner: "host" } })] });`, baseRoot);
  const plain = `---\nimport Layout from "@wpmoo/astro/Layout.astro";\n---\n<Layout title="Page"><p>Body</p></Layout>`;
  await write("src/pages/404.astro", plain, baseRoot);
  await write("src/pages/de/404.astro", plain, baseRoot);
  await write("src/pages/about.astro", plain, baseRoot);
  await write("src/pages/[...slug].astro", `---
import Layout from "@wpmoo/astro/Layout.astro";
export const getStaticPaths = () => [{ params: { slug: "de/500" } }];
---
<Layout title="Fehler" lang="de"><p data-current-locale={Astro.currentLocale} data-status={Astro.response.status}>Fehler</p></Layout>`, baseRoot);
  baseResult = astroBuild(baseRoot);
  assert.equal(baseResult.status, 0, baseResult.stderr + baseResult.stdout);
  const read = (file) => readFile(join(baseRoot, "dist", file), "utf8");
  const dynamic = await read("de/500/index.html");
  assert.match(dynamic, /data-current-locale="en" data-status="200"/u);
  assert.deepEqual(robotsOf(dynamic), noindex);
  assert.deepEqual(robotsOf(await read("about/index.html")), []);
});
