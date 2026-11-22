import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { defineSite } from "../packages/astro/src/config/index.js";
import moo from "../packages/astro/src/integration/index.js";
import {
  collectSitemapEntries,
  competingIntegrations,
  escapeXml,
  parseHead,
  renderRobots,
  renderSitemapFiles,
  reservedOutput,
  resolveSeoOutputs,
  selfUrls,
  writeSeoOutputs,
} from "../packages/astro/src/integration/sitemap.js";

const site = "https://example.test";

function builtSite(files) {
  const root = mkdtempSync(join(tmpdir(), "moo-sitemap-"));
  for (const [name, html] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
  }
  return root;
}
const pathnames = (files) =>
  Object.keys(files)
    .filter((name) => name.endsWith(".html"))
    .map((name) => ({ pathname: name.replace(/(^|\/)index\.html$/u, "$1").replace(/\.html$/u, "") }));
const page = (head, body = "<p>x</p>") =>
  `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
const canonical = (href) => `<link rel="canonical" href="${href}">`;
const alternate = (lang, href) => `<link rel="alternate" hreflang="${lang}" href="${href}">`;
const ld = (value) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
function collect(files, options = {}) {
  const root = builtSite(files);
  try {
    return collectSitemapEntries({ dir: root, pages: pathnames(files), site, trailingSlash: "always", ...options });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("site.seo takes sitemap, htmlSitemap and robots; both outputs default to on", () => {
  assert.deepEqual(resolveSeoOutputs(undefined), { sitemap: true, robots: true, disallow: [] });
  const configured = defineSite({ seo: { sitemap: false, htmlSitemap: false, robots: { disallow: ["/intern/", "/*?q="] } } });
  assert.deepEqual(resolveSeoOutputs(configured.seo), { sitemap: false, robots: true, disallow: ["/intern/", "/*?q="] });
  assert.deepEqual(resolveSeoOutputs(defineSite({ seo: { robots: false } }).seo), { sitemap: true, robots: false, disallow: [] });
  for (const [seo, field] of [
    [{ sitemap: "no" }, "site.seo.sitemap"],
    [{ robots: { disallow: ["intern"] } }, "site.seo.robots"],
    [{ robots: { disallow: ["/a\nSitemap: x"] } }, "site.seo.robots"],
    [{ robots: { allow: ["/"] } }, "site.seo.robots"],
    [{ xml: true }, "site.seo"],
  ])
    assert.throws(() => defineSite({ seo }), (error) => error.message.startsWith(field));
});

test("the head parser reads attributes in any order and quoting, inside the head only", () => {
  const head = parseHead(
    `<html><head><!-- <link rel="canonical" href="https://example.test/comment/"> -->
<LINK HREF='https://example.test/a/?x=1&amp;y=2' REL='Canonical'>
<link hreflang=de href=https://example.test/de/a/ rel="alternate">
<link rel="alternate stylesheet" href="/print.css">
<script>document.write('<link rel="canonical" href="https://example.test/script/">')</script>
<meta content="NOINDEX,follow" name="Robots">
</head><body><link rel="canonical" href="https://example.test/body/">
${ld({ "@graph": [{ "@type": "WebPage", url: "https://example.test/a/", dateModified: "2026-01-02" }] })}</body></html>`,
  );
  assert.deepEqual(head.canonicals, ["https://example.test/a/?x=1&y=2"]);
  assert.deepEqual(head.alternates, [{ hreflang: "de", href: "https://example.test/de/a/" }]);
  assert.equal(head.noindex, true);
  assert.deepEqual(head.dates, [{ url: "https://example.test/a/", id: undefined, modified: "2026-01-02", published: undefined }]);
  assert.equal(parseHead(page('<meta name="robots" content="none">')).noindex, true);
  assert.equal(parseHead(page('<meta name="robots" content="index, follow">')).noindex, false);
});

test("self URLs follow base and trailingSlash; ignore accepts both forms", () => {
  assert.deepEqual(selfUrls("", { site, base: "/", trailingSlash: "always" }), [`${site}/`]);
  assert.deepEqual(selfUrls("", { site, base: "/docs", trailingSlash: "never" }), [`${site}/docs`]);
  assert.deepEqual(selfUrls("a/b/", { site, base: "/docs/", trailingSlash: "always" }), [`${site}/docs/a/b/`]);
  assert.deepEqual(selfUrls("a", { site, base: "/", trailingSlash: "never" }), [`${site}/a`]);
  assert.deepEqual(selfUrls("a", { site, base: "/", trailingSlash: "ignore" }), [`${site}/a`, `${site}/a/`]);
});

test("the list holds self-canonical, indexable pages only, with lastmod and alternates", () => {
  const files = {
    "index.html": page(canonical(`${site}/`) + ld({ "@type": "WebPage", url: `${site}/`, datePublished: "2026-03-01T10:00:00.000Z" })),
    "a/index.html": page(
      canonical(`${site}/a/`) + alternate("en", `${site}/a/`) + alternate("de", `${site}/de/a/`) +
        ld({ "@type": "BreadcrumbList", itemListElement: [] }) +
        ld({ "@type": "BlogPosting", url: `${site}/a/`, datePublished: "2026-01-01", dateModified: "2026-02-03T04:05:06+01:00" }),
    ),
    "de/a/index.html": page(canonical(`${site}/de/a/`) + alternate("en", `${site}/a/`) + alternate("de", `${site}/de/a/`)),
    "hidden/index.html": page(canonical(`${site}/hidden/`) + '<meta name="robots" content="noindex, follow">'),
    "copy/index.html": page(canonical(`${site}/a/`)),
    "bare/index.html": page(""),
    "slashless/index.html": page(canonical(`${site}/slashless`)),
    "404.html": page(canonical(`${site}/404/`)),
    "de/404/index.html": page(canonical(`${site}/de/404/`)),
    "blog/404/index.html": page(canonical(`${site}/blog/404/`)),
    "nodate/index.html": page(canonical(`${site}/nodate/`) + ld({ "@type": "WebPage", url: `${site}/nodate/`, dateModified: "last week" })),
  };
  const warnings = [];
  const { entries, skipped } = collect(files, { errorPaths: ["/de/404"], warn: (message) => warnings.push(message) });
  assert.deepEqual(entries.map((entry) => entry.loc), [`${site}/`, `${site}/a/`, `${site}/blog/404/`, `${site}/de/a/`, `${site}/nodate/`]);
  assert.equal(skipped, 6);
  assert.equal(entries[0].lastmod, "2026-03-01T10:00:00.000Z");
  assert.equal(entries[1].lastmod, "2026-02-03T04:05:06+01:00");
  assert.equal(Object.hasOwn(entries[3], "lastmod"), false);
  assert.equal(Object.hasOwn(entries[4], "lastmod"), false);
  assert.match(warnings.join("\n"), /nodate\/index\.html.*not a W3C date/u);
  assert.deepEqual(entries[1].alternates, [
    { hreflang: "en", href: `${site}/a/` },
    { hreflang: "de", href: `${site}/de/a/` },
  ]);
});

test("the guard fails on unlisted alternates, duplicate canonicals and several canonicals", () => {
  assert.throws(
    () => collect({ "a/index.html": page(canonical(`${site}/a/`) + alternate("de", `${site}/de/a/`)) }),
    /alternates that are not listed pages \(missing, redirected, noindex or not self-canonical\):\nhttps:\/\/example\.test\/a\/ → https:\/\/example\.test\/de\/a\/ \(de\)/u,
  );
  // Two distinct files, a.html (page "a") and a/index.html (page "a/"),
  // both served as /a under trailingSlash "ignore".
  assert.throws(
    () =>
      collect(
        { "a/index.html": page(canonical(`${site}/a`)), "a.html": page(canonical(`${site}/a`)) },
        { trailingSlash: "ignore" },
      ),
    /a\/index\.html and a\.html both name https:\/\/example\.test\/a as their canonical|a\.html and a\/index\.html both name https:\/\/example\.test\/a as their canonical/u,
  );
  assert.throws(
    () => collect({ "a/index.html": page(canonical(`${site}/a/`) + canonical(`${site}/b/`)) }),
    /2 different canonical links/u,
  );
  assert.throws(() => collect({}, { site: undefined }), /seo: \{ sitemap: false \}/u);
});

test("XML is escaped, namespaced only for alternates, and absolute", () => {
  assert.equal(escapeXml(`a&b<c>"d"'e'`), "a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
  const [plain] = renderSitemapFiles([{ loc: `${site}/a?b=1&c=2`, alternates: [] }], { site });
  assert.equal(plain.name, "sitemap.xml");
  assert.equal(
    plain.content,
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${site}/a?b=1&amp;c=2</loc></url>\n</urlset>\n`,
  );
  const [localized] = renderSitemapFiles(
    [{ loc: `${site}/a/`, lastmod: "2026-01-01", alternates: [{ hreflang: "de", href: `${site}/de/a/` }] }],
    { site },
  );
  assert.match(localized.content, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/u);
  assert.match(
    localized.content,
    /<url><loc>https:\/\/example\.test\/a\/<\/loc><lastmod>2026-01-01<\/lastmod><xhtml:link rel="alternate" hreflang="de" href="https:\/\/example\.test\/de\/a\/"\/><\/url>/u,
  );
});

test("above the limit sitemap.xml becomes an index of numbered files", () => {
  const entries = Array.from({ length: 5 }, (_, index) => ({ loc: `${site}/docs/p${index}/`, alternates: [] }));
  assert.deepEqual(renderSitemapFiles(entries, { site, base: "/docs", limit: 5 }).map((file) => file.name), ["sitemap.xml"]);
  const files = renderSitemapFiles(entries, { site, base: "/docs", limit: 2 });
  assert.deepEqual(files.map((file) => file.name), ["sitemap.xml", "sitemap-1.xml", "sitemap-2.xml", "sitemap-3.xml"]);
  assert.match(files[0].content, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/u);
  assert.deepEqual(
    [...files[0].content.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]),
    [`${site}/docs/sitemap-1.xml`, `${site}/docs/sitemap-2.xml`, `${site}/docs/sitemap-3.xml`],
  );
  assert.equal((files[3].content.match(/<url>/gu) ?? []).length, 1);
  assert.throws(() => renderSitemapFiles(entries, { site, limit: 0 }), /positive integer/u);
});

test("robots.txt allows everything, adds Disallow lines and the sitemap", () => {
  assert.equal(renderRobots({ sitemapUrl: `${site}/sitemap.xml` }), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
  assert.equal(renderRobots({ disallow: ["/intern/"] }), "User-agent: *\nAllow: /\nDisallow: /intern/\n");
});

test("outputs are written once and never overwrite a file in the build output", () => {
  const files = { "index.html": page(canonical(`${site}/docs/`)) };
  const root = builtSite(files);
  try {
    const outputs = resolveSeoOutputs({ robots: { disallow: ["/docs/intern/"] } });
    const result = writeSeoOutputs({ dir: root, pages: pathnames(files), site, base: "/docs", trailingSlash: "always", outputs });
    assert.deepEqual(result.files, ["sitemap.xml", "robots.txt"]);
    assert.equal(
      readFileSync(join(root, "robots.txt"), "utf8"),
      `User-agent: *\nAllow: /\nDisallow: /docs/intern/\n\nSitemap: ${site}/docs/sitemap.xml\n`,
    );
    assert.match(readFileSync(join(root, "sitemap.xml"), "utf8"), /<loc>https:\/\/example\.test\/docs\/<\/loc>/u);
    rmSync(join(root, "sitemap.xml"));
    assert.throws(
      () => writeSeoOutputs({ dir: root, pages: pathnames(files), site, base: "/docs", trailingSlash: "always", outputs }),
      /writes robots\.txt at build.*robots: false/u,
    );
    assert.equal(readFileSync(join(root, "robots.txt"), "utf8").includes("Disallow"), true);
    assert.throws(() => readFileSync(join(root, "sitemap.xml")), /ENOENT/u);
    const robotsOnly = writeSeoOutputs({
      dir: builtSite({}),
      pages: [],
      site: undefined,
      outputs: resolveSeoOutputs({ sitemap: false }),
    });
    assert.deepEqual(robotsOnly.files, ["robots.txt"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("collisions: reserved paths and competing sitemap or robots integrations", () => {
  const outputs = resolveSeoOutputs(undefined);
  assert.equal(reservedOutput("/sitemap.xml", outputs, "/"), "sitemap.xml");
  assert.equal(reservedOutput("/docs/sitemap-2.xml", outputs, "/docs"), "sitemap-2.xml");
  assert.equal(reservedOutput("/robots.txt", outputs, "/"), "robots.txt");
  assert.equal(reservedOutput("/feed.xml", outputs, "/"), null);
  assert.equal(reservedOutput("/robots.txt", resolveSeoOutputs({ robots: false }), "/"), null);
  assert.equal(reservedOutput("/sitemap.xml", resolveSeoOutputs({ sitemap: false }), "/"), null);
  assert.deepEqual(
    competingIntegrations(
      [{ name: "@wpmoo/astro" }, { name: "@astrojs/sitemap" }, { name: "astro-theme-x/sitemap" }, { name: "astro-robots-txt" }, { name: "@astrojs/mdx" }],
      outputs,
    ),
    [
      { name: "@astrojs/sitemap", file: "sitemap.xml" },
      { name: "astro-theme-x/sitemap", file: "sitemap.xml" },
      { name: "astro-robots-txt", file: "robots.txt" },
    ],
  );
  assert.deepEqual(competingIntegrations([{ name: "@astrojs/sitemap" }], resolveSeoOutputs({ sitemap: false })), []);
});

function configure(input, config, command = "build") {
  const integration = moo({ plugins: [], ...input });
  const full = {
    root: new URL("file:///tmp/moo-sitemap-host/"),
    srcDir: new URL("file:///tmp/moo-sitemap-host/src/"),
    publicDir: new URL("file:///tmp/moo-sitemap-host/public/"),
    cacheDir: new URL("file:///tmp/moo-sitemap-host/.astro/"),
    markdown: {},
    vite: {},
    base: "/",
    trailingSlash: "ignore",
    output: "static",
    prerenderConflictBehavior: "error",
    integrations: [integration],
    ...config,
  };
  full.integrations = full.integrations.map((item) => (item === "self" ? integration : item));
  if (!full.integrations.includes(integration)) full.integrations.unshift(integration);
  integration.hooks["astro:config:setup"]({ config: full, command, injectRoute() {}, updateConfig() {}, addMiddleware() {} });
  return {
    integration,
    done: () => integration.hooks["astro:config:done"]({ config: full, injectTypes() {} }),
  };
}

test("a build without the Astro site fails naming the opt-out; dev and opt-out pass", () => {
  assert.throws(() => configure({}, {}).done(), /needs the Astro `site`.*moo\(\{ site: \{ seo: \{ sitemap: false \} \} \}\)/u);
  assert.doesNotThrow(() => configure({}, {}, "dev").done());
  assert.doesNotThrow(() => configure({ site: { seo: { sitemap: false } } }, {}).done());
  assert.doesNotThrow(() => configure({}, { site }).done());
});

test("a competing integration or a host route for an SDK output fails the build", () => {
  assert.throws(
    () => configure({}, { site, integrations: ["self", { name: "@astrojs/sitemap", hooks: {} }] }).done(),
    /writes sitemap\.xml at build, and the integration @astrojs\/sitemap also provides it.*sitemap: false/u,
  );
  const notFound = { routeOwner: "host" };
  const { integration } = configure({ notFound }, { site });
  const error = { pattern: "/404", pathname: "/404", entrypoint: "src/pages/404.astro", type: "page", origin: "project", isPrerendered: true, patternRegex: /^\/404$/u };
  const route = (pattern) => [error, { pattern, pathname: pattern, entrypoint: "src/pages/x.ts", type: "endpoint", origin: "project", patternRegex: /^$/u }];
  assert.throws(
    () => integration.hooks["astro:routes:resolved"]({ routes: route("/robots.txt") }),
    /writes robots\.txt at build, and the route \/robots\.txt \(src\/pages\/x\.ts\) also provides it.*robots: false/u,
  );
  assert.doesNotThrow(() => integration.hooks["astro:routes:resolved"]({ routes: route("/feed.xml") }));
  const off = configure({ notFound, site: { seo: { sitemap: false, robots: false } } }, { site });
  assert.doesNotThrow(() => off.integration.hooks["astro:routes:resolved"]({ routes: [...route("/robots.txt"), ...route("/sitemap.xml").slice(1)] }));
});

test("a host public/robots.txt fails the build", () => {
  const root = builtSite({ "public/robots.txt": "User-agent: *\n" });
  try {
    const host = new URL(`file://${root}/`);
    assert.throws(
      () => configure({}, { site, root: host, publicDir: new URL("public/", host) }).done(),
      /writes robots\.txt at build, and public\/robots\.txt also provides it/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import { isW3cDate, leftOutReport } from "../packages/astro/src/integration/sitemap.js";

test("markup inside title, script, style, template, textarea, noscript and comments is not a head tag", () => {
  for (const wrapper of [
    (tag) => `<title>${tag}</title>`,
    (tag) => `<script>${tag}</script>`,
    (tag) => `<style>${tag}</style>`,
    (tag) => `<template>${tag}</template>`,
    (tag) => `<textarea>${tag}</textarea>`,
    (tag) => `<noscript>${tag}</noscript>`,
    (tag) => `<!-- ${tag} -->`,
  ]) {
    const head = parseHead(page(wrapper("<meta name=robots content=noindex>") + wrapper(canonical(`${site}/fake/`)) + canonical(`${site}/a/`)));
    assert.equal(head.noindex, false);
    assert.deepEqual(head.canonicals, [`${site}/a/`]);
  }
  const head = parseHead(page(`<title>x</title>${ld({ "@type": "WebPage", url: `${site}/a/`, datePublished: "2026-01-01" })}`));
  assert.equal(head.dates.length, 1);
});

test("unquoted attribute values keep a slash before >, as in HTML", () => {
  assert.deepEqual(parseHead(page("<link rel=canonical href=https://example.test/a/>")).canonicals, [`${site}/a/`]);
  assert.deepEqual(parseHead(page('<link rel="canonical" href="https://example.test/a" />')).canonicals, [`${site}/a`]);
  assert.deepEqual(parseHead(page("<link href=https://example.test/de/ hreflang=de rel=alternate>")).alternates, [{ hreflang: "de", href: `${site}/de/` }]);
});

test("lastmod comes only from a JSON-LD object about the page itself", () => {
  const listed = (items) =>
    collect({ "a/index.html": page(canonical(`${site}/a/`) + items.map(ld).join("")) }).entries[0];
  assert.equal(Object.hasOwn(listed([{ "@type": "BlogPosting", url: `${site}/other/`, dateModified: "2026-01-01" }]), "lastmod"), false);
  assert.equal(Object.hasOwn(listed([{ "@type": "Event", datePublished: "2026-01-01" }]), "lastmod"), false);
  assert.equal(
    listed([{ "@type": "BlogPosting", url: `${site}/other/`, dateModified: "2026-01-01" }, { "@type": "WebPage", url: "/a/", datePublished: "2026-02-02" }]).lastmod,
    "2026-02-02",
  );
  assert.equal(listed([{ "@type": "WebPage", "@id": `${site}/a/#webpage`, dateModified: "2026-03-03" }]).lastmod, "2026-03-03");
});

test("W3C dates are checked for real calendar and clock values", () => {
  for (const value of ["2026", "2026-05", "2024-02-29", "2026-12-31T23:59Z", "2026-01-02T03:04:05.678+01:00", "2026-01-02T03:04:05-05:30"])
    assert.equal(isW3cDate(value), true, value);
  for (const value of ["2026-13-01", "2026-00", "2026-02-30", "2025-02-29", "2026-04-31", "2026-01-02T24:00Z", "2026-01-02T10:60Z", "2026-01-02T10:00:61Z", "2026-01-02T10:00", "2026-01-02T10:00+1:00", "2026-01-02 10:00Z", "26-01-02", "last week"])
    assert.equal(isW3cDate(value), false, value);
  const warnings = [];
  const { entries } = collect(
    { "a/index.html": page(canonical(`${site}/a/`) + ld({ "@type": "WebPage", url: `${site}/a/`, dateModified: "2026-02-30" })) },
    { warn: (message) => warnings.push(message) },
  );
  assert.equal(Object.hasOwn(entries[0], "lastmod"), false);
  assert.match(warnings.join("\n"), /not a W3C date \(2026-02-30\)/u);
});

test("a relative canonical resolves against the page URL and loc is absolute", () => {
  const { entries } = collect({ "a/index.html": page('<link rel="canonical" href="/a/">'), "b/index.html": page('<link rel="canonical" href="./">') });
  assert.deepEqual(entries.map((entry) => entry.loc), [`${site}/a/`, `${site}/b/`]);
});

test("a page name picks its own file: a/ is a/index.html, a is a.html", () => {
  const root = builtSite({ "a/index.html": page(canonical(`${site}/a/`)), "a.html": page(canonical(`${site}/a`)) });
  try {
    const run = (pathname, trailingSlash) =>
      collectSitemapEntries({ dir: root, pages: [{ pathname }], site, trailingSlash }).entries.map((entry) => entry.loc);
    assert.deepEqual(run("a/", "always"), [`${site}/a/`]);
    assert.deepEqual(run("a", "never"), [`${site}/a`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("left-out pages are reported by reason, the home page with a warning", () => {
  const { left } = collect({
    "index.html": page(""),
    "copy/index.html": page(canonical(`${site}/a/`)),
    "a/index.html": page(canonical(`${site}/a/`)),
    "hidden/index.html": page(canonical(`${site}/hidden/`) + '<meta name="robots" content="noindex">'),
    "404.html": page(""),
  });
  const report = leftOutReport(left);
  assert.equal(report.summary.split(", ").sort().join(", "), "1 canonical is another URL, 1 error page, 1 no canonical, 1 noindex");
  assert.equal(report.warning, "sitemap: the home page / is not listed (no canonical)");
  assert.ok(report.details.includes("sitemap: left out /copy (canonical is another URL)"));
  assert.equal(leftOutReport([]).warning, null);
});
