// Builds an ibeb-like site (ten top-level pages, a 131-page "magazin"
// segment with long titles) and checks the filled /sitemap/ page: grouping,
// order, labels, rows equal to the XML entries, and the table markup.
import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { buildFixture, createSitemapFixture, fixtureSite } from "./helpers/sitemap-fixture.mjs";

let root;
before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "moo-sitemap-page-build-")));
  await createSitemapFixture(root);
});
after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

test("an ibeb-like site gets a top-level group and a Magazin group with every page", async () => {
  const result = buildFixture(root);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const dist = join(root, "dist");
  const html = await readFile(join(dist, "sitemap/index.html"), "utf8");
  const xml = await readFile(join(dist, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
  assert.equal(locs.length, 10 + 1 + 1 + 130 + 1);
  const groups = [...html.matchAll(/<section aria-labelledby="([^"]+)"><h2 id="\1" class="h3">([^<]+)<\/h2>([\s\S]*?)<\/section>/gu)].map(
    (match) => ({
      id: match[1],
      heading: match[2],
      hrefs: [...match[3].matchAll(/<a class="text-break" href="([^"]+)">([^<]*)<\/a>/gu)].map((row) => [row[1], row[2]]),
    }),
  );
  assert.deepEqual(groups.map((group) => [group.id, group.heading]), [
    ["sitemap-seiten", "Seiten (12)"],
    ["sitemap-magazin", "Magazin (131)"],
  ]);
  // Top-level: the home page first, then by title; the single team page joins.
  assert.deepEqual(groups[0].hrefs[0], ["/", "Startseite"]);
  assert.ok(groups[0].hrefs.some(([href]) => href === "/team/vorstand/"));
  assert.ok(groups[0].hrefs.some(([href]) => href === "/sitemap/"));
  const topTitles = groups[0].hrefs.slice(1).map(([, title]) => title);
  assert.deepEqual(topTitles, [...topTitles].sort(new Intl.Collator("de", { sensitivity: "base", numeric: true }).compare));
  // Magazin: its index page first, then by title.
  assert.deepEqual(groups[1].hrefs[0], ["/magazin/", "Magazin"]);
  assert.equal(groups[1].hrefs.length, 131);
  assert.deepEqual(
    new Set(groups.flatMap((group) => group.hrefs.map(([href]) => new URL(href, fixtureSite).href))),
    new Set(locs),
  );
  assert.match(html, /Diese Seite listet alle 143 öffentlichen Seiten/u);
  assert.match(html, /<span class="text-nowrap"><time datetime="2026-04-15T09:00:00\.000Z">2026-04-15<\/time><\/span>/u);
});
