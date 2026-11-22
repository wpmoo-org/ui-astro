// Builds a bilingual site whose pages render through its own Shell (ibeb
// shape, wrapping SDK SiteLayout) and that owns the HTML sitemap pages with
// moo({ sitemap: { routeOwner: "host" } }): the host pages place
// SitemapContent and the build fills them like the SDK page.
import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { buildFixture, createSitemapHostFixture, fixtureSite, hostSitemapPage } from "./helpers/sitemap-fixture.mjs";

let root;
before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "moo-sitemap-host-build-")));
  await createSitemapHostFixture(root);
});
after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

const output = (result) => result.stderr + result.stdout;
const rowHrefs = (html) =>
  [...html.matchAll(/<a class="text-break" href="([^"]+)">/gu)].map((match) => new URL(match[1], fixtureSite).href);

test("host pages in the site's Shell list their locale's sitemap.xml entries, themselves included", async () => {
  const result = buildFixture(root);
  assert.equal(result.status, 0, output(result));
  assert.match(output(result), /HTML sitemap filled: sitemap\/index\.html \(4 rows\), de\/sitemap\/index\.html \(3 rows\)/u);
  const dist = join(root, "dist");
  const xml = await readFile(join(dist, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
  const de = locs.filter((loc) => new URL(loc).pathname.startsWith("/de/"));
  const en = locs.filter((loc) => !de.includes(loc));
  for (const [file, expected, self, lang] of [
    ["sitemap/index.html", en, `${fixtureSite}/sitemap/`, "en"],
    ["de/sitemap/index.html", de, `${fixtureSite}/de/sitemap/`, "de"],
  ]) {
    const html = await readFile(join(dist, file), "utf8");
    assert.deepEqual(new Set(rowHrefs(html)), new Set(expected), file);
    assert.equal(rowHrefs(html).length, expected.length, file);
    assert.ok(rowHrefs(html).includes(self), `${file} lists itself`);
    assert.ok(html.includes(`<link rel="canonical" href="${self}">`), file);
    assert.match(html, new RegExp(`<html lang="${lang}"`, "u"));
    // The page wears the host Shell: its header actions and footer.
    assert.match(html, /<nav aria-label="Service"><a href="\/kontakt\/">Kontakt<\/a><\/nav>/u, file);
    assert.match(html, /<p>Host shell footer<\/p>/u, file);
    assert.match(html, /<h1 class="mb-0">Sitemap<\/h1>/u, file);
    assert.doesNotMatch(html, /MOO_SITEMAP|GROUP_ID/u, file);
  }
  const enHtml = await readFile(join(dist, "sitemap/index.html"), "utf8");
  assert.match(enHtml, /This page lists all 4 public pages/u);
});

test("a host page that forgets SitemapContent fails the build naming it", async () => {
  await writeFile(join(root, "src/pages/de/sitemap.astro"), hostSitemapPage("../../", { content: "<p>Unsere Seiten</p>" }));
  try {
    const result = buildFixture(root);
    assert.notEqual(result.status, 0);
    assert.match(
      output(result),
      /HTML sitemap \/de\/sitemap\/ has no template group\..*must place SitemapContent from @wpmoo\/astro\/blocks\/SitemapContent\.astro exactly once/u,
    );
  } finally {
    await writeFile(join(root, "src/pages/de/sitemap.astro"), hostSitemapPage("../../"));
  }
});

test("a missing host page fails the build naming the locale's expected path", async () => {
  await rm(join(root, "src/pages/de/sitemap.astro"));
  try {
    const result = buildFixture(root);
    assert.notEqual(result.status, 0);
    assert.match(output(result), /sitemap\.routeOwner "host" needs one literal, prerendered host page/u);
    assert.match(output(result), /- de \/de\/sitemap: no page; add src\/pages\/de\/sitemap\.astro and place SitemapContent there/u);
    assert.doesNotMatch(output(result), /- en \/sitemap:/u);
  } finally {
    await writeFile(join(root, "src/pages/de/sitemap.astro"), hostSitemapPage("../../"));
  }
});

test("SitemapContent on another page fails instead of printing its template", async () => {
  await writeFile(join(root, "src/pages/karte.astro"), hostSitemapPage("../"));
  try {
    const result = buildFixture(root);
    assert.notEqual(result.status, 0);
    assert.match(output(result), /SitemapContent renders only on the HTML sitemap page of its locale \(\/sitemap\/\), not on \/karte\//u);
  } finally {
    await rm(join(root, "src/pages/karte.astro"));
  }
});

// SitemapContent accepts only the path forms the build format gives the
// sitemap page, so a look-alike route cannot ship unfilled template tokens.
async function variant(options, extra = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "moo-sitemap-host-variant-")));
  await createSitemapHostFixture(dir, options);
  for (const [name, text] of Object.entries(extra)) await writeFile(join(dir, name), text);
  return dir;
}

test("directory format with trailingSlash never: an extra sitemap.html page with SitemapContent fails the build", async () => {
  // In a content site the native URL rule rejects it at routes:resolved;
  // SitemapContent itself also rejects /sitemap.html there (unit test in
  // sitemap.test.mjs), so no unfilled template can ship.
  const dir = await variant({ trailingSlash: "never" }, { "src/pages/sitemap.html.astro": hostSitemapPage("../") });
  try {
    const result = buildFixture(dir);
    assert.notEqual(result.status, 0);
    assert.match(output(result), /src\/pages\/sitemap\.html\.astro requires canonical URL literals: \/sitemap\.html/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("file format: host pages at sitemap.html pass and are filled", async () => {
  const dir = await variant({ format: "file" });
  try {
    const result = buildFixture(dir);
    assert.equal(result.status, 0, output(result));
    assert.match(output(result), /HTML sitemap filled: sitemap\.html \(4 rows\), de\/sitemap\.html \(3 rows\)/u);
    const html = await readFile(join(dir, "dist/de/sitemap.html"), "utf8");
    assert.equal(rowHrefs(html).length, 3);
    assert.doesNotMatch(html, /MOO_SITEMAP_/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
