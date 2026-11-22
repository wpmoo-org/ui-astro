// The HTML sitemap page fill and sitemap.xsl, without Astro: grouping,
// escaping, the template guard, self-listing, rows equal to the XML
// entries, copy, and a well-formed XSLT with noindex and the page link.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { defineSite } from "../packages/astro/src/config/index.js";
import { resolveI18n } from "../packages/astro/src/i18n/profile.js";
import {
  collectSitemapEntries,
  collisionMessage,
  pageTitleOf,
  parseHead,
  renderSitemapFiles,
  reservedOutput,
  resolveSeoOutputs,
  writeSeoOutputs,
} from "../packages/astro/src/integration/sitemap.js";
import {
  escapeHtml,
  fillSitemapPage,
  groupSitemapPages,
  renderHtmlSitemaps,
  renderSitemapXsl,
  countRenderedRows,
  displayDate,
  sitemapTokens,
  splitLocale,
  xslSource,
} from "../packages/astro/src/integration/sitemap-page.js";
import {
  normalizeSitemap,
  resolveSitemapOptions,
  sitemapPagePath,
} from "../packages/astro/src/sitemap/options.js";

const site = "https://example.test";
const nonce = "a1b2c3d4e5f6a7b8";
const S = sitemapTokens(nonce);

// The markup the route renders at build: Typography section-title and Table
// with one template group and row (shape of the real component output).
const template = (extraHead = "") => `<!doctype html><html lang="en" dir="ltr"><head><title>Sitemap</title><link rel="canonical" href="${site}/sitemap/">${extraHead}<link rel="stylesheet" href="/_astro/site.css"></head><body><div class="moo-ui" data-bs-theme="dark"><main><h1 class="mb-0">Sitemap</h1><p>This page lists all ${S.total} public pages.</p><section aria-labelledby="${S.groupId}"><h2 id="${S.groupId}" class="h3">${S.groupLabel} (${S.groupCount})</h2><div class="table-responsive"><table aria-labelledby="${S.groupId}" class="table"><thead><tr><th scope="col">Page</th><th scope="col" class="text-end">Updated</th></tr></thead><tbody><tr><td><a class="text-break" href="${S.href}">${S.title}</a><span class="d-block small text-body-secondary text-break">${S.description}</span></td><td class="text-end"><span class="text-nowrap"><time datetime="${S.dateTime}">${S.date}</time></span></td></tr></tbody></table></div></section></main></div></body></html>`;
const page = (head) => `<!doctype html><html><head>${head}</head><body></body></html>`;
const canonical = (href) => `<link rel="canonical" href="${href}">`;
const p = (href, title, extra = {}) => ({ href, segments: href.split("/").filter(Boolean), title, ...extra });

function builtSite(files) {
  const root = mkdtempSync(join(tmpdir(), "moo-sitemap-page-"));
  for (const [name, html] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), html);
  }
  return root;
}
const pathnames = (files) =>
  Object.keys(files)
    .filter((name) => name.endsWith(".html"))
    .map((name) => ({ pathname: name.replace(/index\.html$/u, "") }));

test("groups by first segment; small segments join the top-level group", () => {
  const groups = groupSitemapPages(
    [
      p("/magazin/b/", "Beta"),
      p("/kontakt/", "Kontakt"),
      p("/magazin/", "Magazin"),
      p("/", "Start"),
      p("/magazin/a/", "Alpha"),
      p("/team/vorstand/", "Vorstand"),
      p("/archiv/x/", "X"),
      p("/archiv/y/", "Y"),
      p("/about/", "About"),
    ],
    { topLabel: "Seiten", locale: "de" },
  );
  assert.deepEqual(
    groups.map((group) => [group.id, group.label, group.pages.map((item) => item.title)]),
    [
      // The home page is the top-level index; the rest by title.
      ["sitemap-seiten", "Seiten", ["Start", "About", "Kontakt", "Vorstand"]],
      // No listed index page: the label is the segment text.
      ["sitemap-archiv", "archiv", ["X", "Y"]],
      // The index page first, then by title; the label is its title.
      ["sitemap-magazin", "Magazin", ["Magazin", "Alpha", "Beta"]],
    ],
  );
  // Ids stay unique when a segment slug matches the top-level label.
  const ids = groupSitemapPages([p("/", "Home"), p("/pages/a/", "A"), p("/pages/b/", "B")], { topLabel: "Pages" }).map((group) => group.id);
  assert.deepEqual(ids, ["sitemap-pages", "sitemap-pages-2"]);
});

test("locale prefixes split off by the native i18n rules", () => {
  const i18n = { locales: ["en", "de"], defaultLocale: "en", prefixDefaultLocale: false };
  assert.deepEqual(splitLocale("/de/magazin/a/", i18n, "en"), { locale: "de", segments: ["magazin", "a"] });
  assert.deepEqual(splitLocale("/en/a/", i18n, "en"), { locale: "en", segments: ["en", "a"] });
  assert.deepEqual(splitLocale("/en/a/", { ...i18n, prefixDefaultLocale: true }, "en"), { locale: "en", segments: ["a"] });
  assert.deepEqual(splitLocale("/a/", null, "de"), { locale: "de", segments: ["a"] });
});

test("hostile titles and descriptions are escaped once and never re-read as tokens", () => {
  const hostile = `<script>alert("x")</script> & 'q' $& $1 ${S.groupLabel} ${S.title}`;
  const html = fillSitemapPage(template(), {
    nonce,
    groups: [{ id: "sitemap-pages", label: `A & "B"`, pages: [{ href: `/a?x="1"&y='2'`, title: hostile, description: hostile, lastmod: "2026-01-02" }] }],
    noDate: "—",
  });
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39; $&amp; $1"));
  assert.ok(html.includes(`href="/a?x=&quot;1&quot;&amp;y=&#39;2&#39;"`));
  assert.ok(html.includes(`<h2 id="sitemap-pages" class="h3">A &amp; &quot;B&quot; (1)</h2>`));
  assert.ok(html.includes("This page lists all 1 public pages."));
  // The tokens inside the title stay literal text; the template ones are gone.
  assert.equal(html.split(S.title).length - 1, 2);
  assert.equal(html.split(S.groupLabel).length - 1, 2);
  assert.ok(!html.includes(S.groupId) && !html.includes(S.total) && !html.includes(S.href));
  assert.equal(escapeHtml(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
});

test("rows clone the rendered row; no description drops its element; no date shows the fallback", () => {
  const html = fillSitemapPage(template(), {
    nonce,
    groups: [
      { id: "sitemap-a", label: "A", pages: [{ href: "/", title: "Home", description: "", lastmod: undefined }] },
      { id: "sitemap-b", label: "B", pages: [{ href: "/b/", title: "B", description: "About B", lastmod: "2026-03-04T05:06:07.000Z" }] },
    ],
    noDate: "—",
  });
  assert.equal((html.match(/<section /gu) ?? []).length, 2);
  assert.match(html, /<a class="text-break" href="\/">Home<\/a><\/td><td class="text-end"><span class="text-nowrap">—<\/span>/u);
  assert.match(html, /<a class="text-break" href="\/b\/">B<\/a><span class="d-block small text-body-secondary text-break">About B<\/span>/u);
  assert.match(html, /<table aria-labelledby="sitemap-b" class="table">/u);
  // The date part shows; the full lastmod stays in datetime.
  assert.match(html, /<span class="text-nowrap"><time datetime="2026-03-04T05:06:07\.000Z">2026-03-04<\/time><\/span>/u);
  assert.equal(displayDate("2026-05"), "2026-05");
  assert.equal(displayDate("2026-05-06T01:02:03+02:00"), "2026-05-06");
});

test("a missing template fails loudly instead of leaving the page empty", () => {
  const groups = [{ id: "sitemap-a", label: "A", pages: [{ href: "/", title: "Home" }] }];
  assert.throws(() => fillSitemapPage(page("<title>x</title>"), { nonce, groups, source: "/sitemap/" }), /HTML sitemap \/sitemap\/ has no template group.*htmlSitemap: false/u);
  assert.throws(() => fillSitemapPage(template().replace(S.href, "/x"), { nonce, groups }), /no template row/u);
  assert.throws(() => fillSitemapPage(template().replace(S.total, "3"), { nonce, groups }), /no total count/u);
});

test("titles come from JSON-LD, else og:title or <title> without the site suffix", () => {
  const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const loc = `${site}/a/`;
  assert.equal(pageTitleOf(parseHead(page(`<title>T | Org</title>${ld({ url: loc, name: "Raw & Name" })}`)), loc), "Raw & Name");
  assert.equal(pageTitleOf(parseHead(page(`<title>T | Org</title>${ld({ url: `${site}/other/`, name: "Other" })}`)), loc), "T | Org");
  assert.equal(pageTitleOf(parseHead(page(`<title>T &amp; U | Org</title><meta property="og:site_name" content="Org">`)), loc), "T & U");
  assert.equal(pageTitleOf(parseHead(page(`<title>x</title><meta property="og:title" content="OG | Org"><meta property="og:site_name" content="Org">`)), loc), "OG");
  assert.equal(pageTitleOf(parseHead(page("")), loc), null);
  const head = parseHead(page(`<meta name="description" content="A &amp; B"><link rel="stylesheet" href="/a.css">`));
  assert.equal(head.meta.description, "A & B");
  assert.deepEqual(head.stylesheets, ["/a.css"]);
});

test("each locale page lists its own pages, itself included; rows equal the XML entries", () => {
  const files = {
    "index.html": page(`<title>Home</title>${canonical(`${site}/`)}`),
    "a/index.html": page(`<title>A &amp; B</title><meta name="description" content="About &lt;A&gt;">${canonical(`${site}/a/`)}`),
    "de/index.html": page(`<title>Start</title>${canonical(`${site}/de/`)}`),
    "noindex/index.html": page(`<meta name="robots" content="noindex">${canonical(`${site}/noindex/`)}`),
    "sitemap/index.html": template(),
    "de/sitemap/index.html": template().replace(`${site}/sitemap/`, `${site}/de/sitemap/`),
  };
  const root = builtSite(files);
  try {
    const i18n = { locales: ["en", "de"], defaultLocale: "en", prefixDefaultLocale: false };
    const { entries, details } = collectSitemapEntries({ dir: root, pages: pathnames(files), site, trailingSlash: "always" });
    const copy = { topLabel: "Pages", noDate: "—" };
    const pages = [
      { locale: "en", pathname: "sitemap/", href: "/sitemap/", copy },
      { locale: "de", pathname: "de/sitemap/", href: "/de/sitemap/", copy: { ...copy, topLabel: "Seiten" } },
    ];
    const filled = renderHtmlSitemaps({ root, entries, details, site, i18n, lang: "en", pages, nonce });
    assert.deepEqual(filled.map((file) => [file.name, file.rows]), [["sitemap/index.html", 3], ["de/sitemap/index.html", 2]]);
    const listed = new Map();
    for (const file of filled)
      for (const row of file.content.matchAll(/<tr><td><a[^>]*href="([^"]+)">([^<]*)<\/a>[\s\S]*?<span class="text-nowrap">(?:<time datetime="([^"]+)">([^<]*)<\/time>|([^<]*))<\/span><\/td><\/tr>/gu)) {
        if (row[3]) assert.equal(row[4], row[3].slice(0, 10));
        listed.set(new URL(row[1], site).href, row[3] ?? row[5]);
      }
    assert.deepEqual(new Map(entries.map((entry) => [entry.loc, entry.lastmod ?? "—"])), listed);
    assert.ok(filled[0].content.includes(">A &amp; B</a><span class=\"d-block small text-body-secondary text-break\">About &lt;A&gt;</span>"));
    assert.ok(listed.has(`${site}/sitemap/`) && listed.has(`${site}/de/sitemap/`));
    // A sitemap page that does not name itself as canonical is not listed: fail.
    writeFileSync(join(root, "de/sitemap/index.html"), template().replace(`${site}/sitemap/`, `${site}/de/`));
    const again = collectSitemapEntries({ dir: root, pages: pathnames(files), site, trailingSlash: "always" });
    assert.throws(() => renderHtmlSitemaps({ root, ...again, site, i18n, lang: "en", pages, nonce }), /\/de\/sitemap\/ is not listed/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function wellFormed(xml) {
  const result = spawnSync("python3", ["-I", "-c", "import sys, xml.etree.ElementTree as ET; print(ET.fromstring(sys.stdin.read()).tag)"], { input: xml, encoding: "utf8" });
  if (result.error) return null;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("sitemap.xsl is well-formed XSLT with noindex, the page link, safe hrefs and the state script", () => {
  const copy = resolveSitemapOptions({ site: defineSite(), base: "/", trailingSlash: "always", i18n: null, sitemap: normalizeSitemap() }).copy;
  const xsl = renderSitemapXsl({
    copy,
    lang: "en",
    theme: "dark",
    siteName: "Org & Co",
    stylesheets: ["/_astro/a{b}.css", "https://cdn.test/x.css?a=1&b=2"],
    stateScript: "if (a < b && c) { x = ']]>'; }",
    pageHref: "/docs/sitemap/",
  });
  const tag = wellFormed(xsl);
  if (tag !== null) assert.equal(tag, "{http://www.w3.org/1999/XSL/Transform}stylesheet");
  assert.ok(xsl.includes('<meta name="robots" content="noindex, follow"/>'));
  assert.ok(xsl.includes('<a href="/docs/sitemap/">Sitemap page</a>'));
  assert.ok(xsl.includes('<link rel="stylesheet" href="/_astro/a{{b}}.css"/>'));
  assert.ok(xsl.includes('href="https://cdn.test/x.css?a=1&amp;b=2"'));
  assert.ok(xsl.includes("]]]]><![CDATA[>"));
  assert.ok(xsl.includes('data-bs-theme="dark"'));
  assert.ok(xsl.includes("<title>XML Sitemap — Org &amp; Co</title>"));
  assert.ok(xsl.includes("public URLs of this site for search engines such as Google and Bing."));
  assert.ok(!xsl.includes("sitemaps.org/protocol") && !xsl.includes("{protocol}"));
  // A urlset and a sitemap index render alike.
  assert.ok(xsl.includes('select="sitemap:urlset/sitemap:url | sitemap:sitemapindex/sitemap:sitemap"'));
  const off = renderSitemapXsl({ copy, pageHref: null });
  assert.ok(!off.includes("Sitemap page"));
  if (wellFormed(off) !== null) assert.ok(true);
});

test("the xsl takes its look from the sitemap page, else the home page, else the first listed page", () => {
  const files = {
    "index.html": `<html lang="de" dir="ltr"><head>${canonical(`${site}/docs/`)}<link rel="stylesheet" href="/docs/_astro/home.css"><meta property="og:site_name" content="Org"></head><body><div class="moo-ui" data-bs-theme="light"></div></body></html>`,
    "sitemap/index.html": template().replace(`${site}/sitemap/`, `${site}/docs/sitemap/`).replace("/_astro/site.css", "../_astro/page.css"),
  };
  const root = builtSite(files);
  try {
    const page = xslSource({ root, site, base: "/docs", pagePathname: "sitemap/" });
    assert.deepEqual(page.stylesheets, ["/docs/_astro/page.css"]);
    assert.equal(page.theme, "dark");
    const home = xslSource({ root, site, base: "/docs" });
    assert.deepEqual([home.stylesheets, home.lang, home.theme, home.siteName], [["/docs/_astro/home.css"], "de", "light", "Org"]);
    rmSync(join(root, "index.html"));
    const first = xslSource({ root, site, base: "/docs", entries: [{ loc: "x" }], details: new Map([["x", { pathname: "sitemap/" }]]) });
    assert.deepEqual(first.stylesheets, ["/docs/_astro/page.css"]);
    assert.deepEqual(xslSource({ root: builtSite({}), site }).stylesheets, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every sitemap file has the stylesheet instruction on line 2", () => {
  const entries = Array.from({ length: 3 }, (_, index) => ({ loc: `${site}/docs/p${index}/`, alternates: [] }));
  for (const file of [...renderSitemapFiles(entries, { site, base: "/docs" }), ...renderSitemapFiles(entries, { site, base: "/docs", limit: 2 })]) {
    assert.equal(file.content.split("\n")[1], '<?xml-stylesheet type="text/xsl" href="sitemap.xsl"?>', file.name);
    // Every file sits next to sitemap.xsl under the base.
    const href = file.content.split("\n")[1].match(/href="([^"]+)"/u)[1];
    assert.equal(new URL(href, `${site}/docs/${file.name}`).href, `${site}/docs/sitemap.xsl`);
  }
});

test("writeSeoOutputs fills the pages, writes sitemap.xsl and keeps the collision rule", () => {
  const files = {
    "index.html": page(`<title>Home</title>${canonical(`${site}/`)}`),
    "sitemap/index.html": template(),
  };
  const root = builtSite(files);
  try {
    const copy = resolveSitemapOptions({ site: defineSite(), base: "/", trailingSlash: "always", i18n: null, sitemap: normalizeSitemap() }).copy;
    const options = {
      dir: root,
      pages: pathnames(files),
      site,
      trailingSlash: "always",
      outputs: resolveSeoOutputs(undefined),
      lang: "en",
      xslCopy: copy,
      stateScript: "/* state */",
      htmlSitemap: { nonce, pages: [{ locale: "en", pathname: "sitemap/", href: "/sitemap/", copy }] },
    };
    const result = writeSeoOutputs(options);
    assert.deepEqual(result.files, ["sitemap.xml", "sitemap.xsl", "robots.txt"]);
    assert.deepEqual(result.pages, [{ name: "sitemap/index.html", rows: 2, locale: "en" }]);
    const xsl = readFileSync(join(root, "sitemap.xsl"), "utf8");
    assert.ok(xsl.includes('href="/sitemap/"') && xsl.includes('href="/_astro/site.css"') && xsl.includes("/* state */"));
    assert.ok(!readFileSync(join(root, "sitemap/index.html"), "utf8").includes(`MOO_SITEMAP_${nonce}`));
    // A sitemap.xsl already in the output (public/ or another writer) fails.
    rmSync(join(root, "sitemap.xml"));
    rmSync(join(root, "robots.txt"));
    writeFileSync(join(root, "sitemap/index.html"), template());
    assert.throws(() => writeSeoOutputs(options), /writes sitemap\.xsl at build.*sitemap: false/u);
    // With htmlSitemap off the xsl still comes, without the page link.
    rmSync(join(root, "sitemap.xsl"));
    rmSync(join(root, "sitemap"), { recursive: true });
    const off = writeSeoOutputs({ ...options, pages: [{ pathname: "" }], outputs: resolveSeoOutputs({ htmlSitemap: false }) });
    assert.deepEqual(off.pages, []);
    const plain = readFileSync(join(root, "sitemap.xsl"), "utf8");
    assert.ok(!plain.includes("Sitemap page"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reserved paths and collision messages cover sitemap.xsl and the page", () => {
  const outputs = resolveSeoOutputs(undefined);
  assert.equal(reservedOutput("/sitemap.xsl", outputs, "/"), "sitemap.xsl");
  assert.equal(reservedOutput("/sitemap.xsl", resolveSeoOutputs({ sitemap: false }), "/"), null);
  assert.match(collisionMessage("/sitemap/", "public/sitemap/index.html"), /writes \/sitemap\/ at build.*htmlSitemap: false/u);
  assert.match(collisionMessage("sitemap.xsl", "x"), /seo: \{ sitemap: false \}/u);
});

test("copy: built-in en and de, host override per locale, and the fallback chain", () => {
  const profile = (sitemap, lang = "de") => {
    const config = defineSite({ defaults: { lang } });
    return {
      site: config,
      base: "/docs",
      trailingSlash: "always",
      i18n: resolveI18n({ locales: ["de", "en", "fr"], defaultLocale: lang, routing: { prefixDefaultLocale: false } }, config),
      sitemap: normalizeSitemap(sitemap),
    };
  };
  const plain = profile();
  assert.equal(resolveSitemapOptions(plain, "de").copy.pageLabel, "Seite");
  assert.equal(resolveSitemapOptions(plain, "en").copy.pageLabel, "Page");
  // fr has no built-in copy: host fr, built-in fr, host main, built-in main.
  assert.equal(resolveSitemapOptions(plain, "fr").copy.pageLabel, "Seite");
  const custom = profile({ messages: { fr: { title: "Plan du site" }, de: { topLabel: "Allgemein" } } });
  assert.equal(resolveSitemapOptions(custom, "fr").copy.title, "Plan du site");
  assert.equal(resolveSitemapOptions(custom, "fr").copy.topLabel, "Allgemein");
  assert.equal(resolveSitemapOptions(custom, "de").href, "/docs/sitemap/");
  assert.equal(resolveSitemapOptions(custom, "en").href, "/docs/en/sitemap/");
  assert.equal(resolveSitemapOptions(custom, "en").xmlHref, "/docs/sitemap.xml");
  assert.deepEqual(resolveSitemapOptions(custom, "en").languageLinks.map((link) => link.href), ["/docs/sitemap/", "/docs/en/sitemap/", "/docs/fr/sitemap/"]);
  assert.equal(sitemapPagePath("en", plain.i18n), "/en/sitemap");
  assert.throws(() => normalizeSitemap({ messages: { de: { intro: "Ohne Platzhalter" } } }), /intro must contain \{count\}, \{xml\} exactly once each/u);
  // The sitemaps.org link is gone: its label and placeholder are rejected.
  assert.throws(() => normalizeSitemap({ messages: { de: { protocolLabel: "x" } } }), /moo\.sitemap\.messages\.de\.protocolLabel is unsupported/u);
  assert.throws(() => normalizeSitemap({ messages: { de: { intro: "{count} {xml} {protocol}" } } }), /intro must not contain \{protocol\}/u);
  assert.throws(() => normalizeSitemap({ messages: { en: { xmlIntro: "{count} {protocol}" } } }), /xmlIntro must not contain \{protocol\}/u);
  assert.equal(normalizeSitemap({ messages: { de: { intro: "{count} Seiten, siehe {xml}." } } }).messages.de.intro, "{count} Seiten, siehe {xml}.");
  assert.throws(() => normalizeSitemap({ messages: { de: { heading: "x" } } }), /moo\.sitemap\.messages\.de\.heading is unsupported/u);
  assert.throws(() => normalizeSitemap({ messages: { de: { title: "a\nb" } } }), /nonempty plain text/u);
  assert.throws(() => normalizeSitemap({ pages: [] }), /moo\.sitemap\.pages is unsupported/u);
  assert.throws(() => resolveSitemapOptions(profile({ messages: { it: { title: "x" } } }), "de"), /must belong to the active locales/u);
});

test("tokens are random per build; a title, label or host text holding a token is plain text", () => {
  assert.notEqual(sitemapTokens("aaaaaaaa1").total, sitemapTokens("bbbbbbbb2").total);
  assert.throws(() => sitemapTokens(""), /nonce/u);
  // Host layout text that looks like a token outside the template is kept.
  const host = template().replace("<main>", "<main><p>Literal MOO_SITEMAP_TOTAL_ and MOO_SITEMAP_TITLE_ text</p>");
  const label = `${S.groupLabel} ${S.title} MOO_SITEMAP_x`;
  const html = fillSitemapPage(host, {
    nonce,
    groups: [{ id: "sitemap-a", label, pages: [{ href: "/", title: `${S.title} ${S.total}`, description: S.description }] }],
  });
  assert.ok(html.includes("<p>Literal MOO_SITEMAP_TOTAL_ and MOO_SITEMAP_TITLE_ text</p>"));
  assert.ok(html.includes(`>${S.groupLabel} ${S.title} MOO_SITEMAP_x (1)</h2>`));
  assert.ok(html.includes(`>${S.title} ${S.total}</a>`));
  assert.ok(html.includes("This page lists all 1 public pages."));
  // A token of this build outside the template regions is a malformed template.
  assert.throws(
    () => fillSitemapPage(template().replace("<main>", `<main><span>${S.total}</span>`), { nonce, groups: [] }),
    /intro element|single template group/u,
  );
  assert.throws(
    () => fillSitemapPage(template().replace("</main>", `<p>${S.href}</p></main>`), { nonce, groups: [] }),
    /single template group/u,
  );
  // An unexpected token inside the group template is caught before filling.
  assert.throws(
    () => fillSitemapPage(template().replace("<thead>", `<thead data-x="${S.total}">`), { nonce, groups: [] }),
    /unexpected token/u,
  );
});

test("the row guard counts rendered data rows, so an extra static row fails", () => {
  const files = {
    "index.html": page(`<title>Home</title>${canonical(`${site}/`)}`),
    "sitemap/index.html": template().replace("</tbody>", "<tr><td>static</td><td>x</td></tr></tbody>"),
  };
  const root = builtSite(files);
  try {
    const { entries, details } = collectSitemapEntries({ dir: root, pages: pathnames(files), site, trailingSlash: "always" });
    const pages = [{ locale: "en", pathname: "sitemap/", href: "/sitemap/", copy: { topLabel: "Pages", noDate: "—" } }];
    assert.throws(() => renderHtmlSitemaps({ root, entries, details, site, lang: "en", pages, nonce }), /renders 3 rows for 2 URLs/u);
    writeFileSync(join(root, "sitemap/index.html"), template());
    assert.equal(renderHtmlSitemaps({ root, entries, details, site, lang: "en", pages, nonce })[0].rows, 2);
    const filled = fillSitemapPage(template(), { nonce, groups: [{ id: "sitemap-a", label: "A", pages: [{ href: "/", title: "x" }, { href: "/b/", title: "y" }] }] });
    assert.equal(countRenderedRows(filled, ["sitemap-a"]), 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
