// A site with no content plugins (plugins: []) and the default SEO outputs
// builds: the SDK sitemap and 404 routes render in SiteLayout without the
// content context, and /sitemap/ lists what the build:done scan finds.
import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { buildFixture, createUiOnlySitemapFixture, fixtureSite } from "./helpers/sitemap-fixture.mjs";

let root;
before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "moo-sitemap-ui-only-")));
  await createUiOnlySitemapFixture(root);
});
after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

test("a plugins: [] site gets /sitemap/, sitemap.xml, robots.txt and the SDK 404 page", async () => {
  const result = buildFixture(root);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const read = (file) => readFile(join(root, "dist", file), "utf8");
  const xml = await read("sitemap.xml");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
  assert.deepEqual(new Set(locs), new Set(["/", "/about/", "/sitemap/"].map((path) => new URL(path, fixtureSite).href)));
  const html = await read("sitemap/index.html");
  assert.doesNotMatch(html, /MOO_SITEMAP_/u);
  const rows = [...html.matchAll(/<a class="text-break" href="([^"]+)">([^<]*)<\/a>/gu)].map((match) => [match[1], match[2]]);
  assert.deepEqual(new Set(rows.map(([href]) => new URL(href, fixtureSite).href)), new Set(locs));
  assert.ok(rows.some(([href]) => href === "/sitemap/"), "the page lists itself");
  assert.match(await read("robots.txt"), new RegExp(`Sitemap: ${fixtureSite}/sitemap\\.xml`, "u"));
  const notFound = await read("404.html");
  assert.match(notFound, /Page not found/u);
  assert.ok(!locs.some((loc) => loc.includes("404")));
});
