// Builds a small host site and checks sitemap.xml and robots.txt against the
// built pages in both directions: every listed URL is a built page that names
// itself as canonical without noindex, and every such page is listed.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
  await write("src/content/page/en/tom.md", "---\ntitle: \"Tom & Jerry's <b>show</b>\"\nslug: tom\nstatus: publish\nlocale: en\ntranslationKey: tom\ndescription: \"Cats & <mice>\"\n---\nBody.");
  await entry("en", "hidden", "seo:\n  noindex: true\n");
  await write("src/content/page/en/draft.md", "---\ntitle: Draft\nslug: draft\nstatus: draft\nlocale: en\ntranslationKey: draft\n---\nBody.");
  // Host pages: a copy naming another canonical, a page without a canonical,
  // and a self-canonical page with reordered attributes and a JSON-LD @graph.
  await write("src/pages/copy.astro", `<html><head><link rel="canonical" href="${site}/docs/contact/"></head><body>Copy</body></html>`);
  // A host page with a hostile title and description, self-canonical.
  await write(
    "src/pages/evil.astro",
    `---\nconst title = \`<script>alert("x")</script> & 'q' $& MOO_SITEMAP_TITLE_\`;\n---\n<html><head><title>{title}</title><meta name="description" content={title}><link rel="canonical" href="${site}/docs/evil/"></head><body>Evil</body></html>`,
  );
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
  // The SDK 404 route passes noindex and is an error page: one robots meta.
  for (const file of ["404.html", "de/404/index.html"]) {
    const html = await readFile(join(dist, file), "utf8");
    assert.deepEqual(html.match(/<meta name="robots"[^>]*>/gu), ['<meta name="robots" content="noindex, follow">'], file);
  }
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

function rowsOf(html) {
  const rows = new Map();
  for (const table of html.match(/<table[\s\S]*?<\/table>/gu) ?? [])
    for (const row of [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/gu)].slice(1)) {
      const href = row[1].match(/<a[^>]*href="([^"]+)"/u)[1];
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gu)];
      const date = cells.at(-1)[1];
      const time = date.match(/<time datetime="([^"]+)">([^<]*)<\/time>/u);
      // The date part shows; datetime holds the full XML lastmod.
      if (time) assert.equal(time[2], time[1].slice(0, 10));
      rows.set(new URL(href, site).href, time ? time[1] : date.replace(/<[^>]+>/gu, "").trim());
    }
  return rows;
}
const pythonParses = (file) => {
  const result = spawnSync("python3", ["-I", "-c", "import sys, xml.etree.ElementTree as ET; print(ET.parse(sys.argv[1]).getroot().tag)", file], { encoding: "utf8" });
  return result.error ? null : result;
};

test("each locale's /sitemap/ lists that locale's pages and all rows equal the XML entries", async () => {
  const dist = join(root, "dist");
  const xml = await readFile(join(dist, "sitemap.xml"), "utf8");
  const entries = new Map(
    [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/gu)].map((match) => [match[1], match[2] ?? "—"]),
  );
  const en = await readFile(join(dist, "sitemap/index.html"), "utf8");
  const de = await readFile(join(dist, "de/sitemap/index.html"), "utf8");
  for (const html of [en, de]) assert.ok(!html.includes("MOO_SITEMAP_GROUP") && !html.includes("MOO_SITEMAP_HREF"), "no template left");
  const enRows = rowsOf(en);
  const deRows = rowsOf(de);
  assert.deepEqual(new Map([...enRows, ...deRows]), entries);
  assert.equal(enRows.size + deRows.size, entries.size);
  // Self-listing, and each page holds only its locale.
  assert.ok(enRows.has(`${site}/docs/sitemap/`) && deRows.has(`${site}/docs/de/sitemap/`));
  assert.ok([...deRows.keys()].every((url) => url.startsWith(`${site}/docs/de/`)));
  assert.ok(![...enRows.keys()].some((url) => url.startsWith(`${site}/docs/de/`)));
  assert.equal(enRows.get(`${site}/docs/contact/`), "2026-02-03T03:05:06.000Z");
  // Heading order: the page title, then one heading per group, each naming
  // its section and table.
  const main = en.slice(en.indexOf("<main"));
  const headings = [...main.matchAll(/<h([1-6])[^>]*>/gu)].map((match) => Number(match[1]));
  assert.equal(headings[0], 1);
  assert.ok(headings.slice(1).length >= 1 && headings.slice(1).every((level) => level === 2));
  for (const [, id] of main.matchAll(/<h2 id="([^"]+)"/gu)) {
    assert.match(main, new RegExp(`<section aria-labelledby="${id}">`, "u"));
    assert.match(main, new RegExp(`<table aria-labelledby="${id}" class="table">`, "u"));
  }
  assert.match(en, /This page lists all \d+ public pages/u);
  assert.match(en, new RegExp(`all ${enRows.size} public pages`, "u"));
  assert.match(en, /<a href="\/docs\/sitemap\.xml">XML sitemap<\/a>/u);
  assert.match(en, /machine-readable <a href="\/docs\/sitemap\.xml">XML sitemap<\/a>\.<\/p>/u);
  assert.ok(!en.includes("sitemaps.org/protocol") && !de.includes("sitemaps.org/protocol"));
  assert.match(de, /<th scope="col">Seite<\/th><th scope="col" class="text-end">Aktualisiert<\/th>/u);
  assert.match(de, /alle \d+ öffentlichen Seiten/u);
  // Hostile titles are text: escaped once, never markup.
  assert.ok(!en.includes('<script>alert("x")'));
  assert.ok(en.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39; $&amp; MOO_SITEMAP_TITLE_</a>"));
  assert.ok(en.includes("Tom &amp; Jerry&#39;s &lt;b&gt;show&lt;/b&gt;</a><span class=\"d-block small text-body-secondary text-break\">Cats &amp; &lt;mice&gt;</span>"));
  // The XML view: stylesheet instruction, noindex, the page link, the page's CSS.
  assert.equal(xml.split("\n")[1], '<?xml-stylesheet type="text/xsl" href="sitemap.xsl"?>');
  const xsl = await readFile(join(dist, "sitemap.xsl"), "utf8");
  const parsed = pythonParses(join(dist, "sitemap.xsl"));
  if (parsed) {
    assert.equal(parsed.status, 0, parsed.stderr);
    assert.equal(parsed.stdout.trim(), "{http://www.w3.org/1999/XSL/Transform}stylesheet");
  }
  assert.ok(xsl.includes('<meta name="robots" content="noindex, follow"/>'));
  assert.ok(xsl.includes('<a href="/docs/sitemap/">Sitemap page</a>'));
  // Under the base: the page link, the stylesheets and the PI target.
  const pi = xml.split("\n")[1].match(/href="([^"]+)"/u)[1];
  assert.equal(new URL(pi, `${site}/docs/sitemap.xml`).href, `${site}/docs/sitemap.xsl`);
  const xslCss = [...xsl.matchAll(/<link rel="stylesheet" href="([^"]+)"\/>/gu)].map((match) => match[1]);
  assert.ok(xslCss.length > 0 && xslCss.every((href) => href.startsWith("/docs/_astro/")), xslCss.join(" "));
  const css = [...en.slice(0, en.indexOf("</head>")).matchAll(/<link rel="stylesheet" href="([^"]+)"/gu)].map((match) => match[1]);
  assert.ok(css.length > 0);
  for (const href of css) assert.ok(xsl.includes(`<link rel="stylesheet" href="${href}"/>`), href);
});

test("a host robots.txt, a host sitemap route or a missing site fail the build", async () => {
  await write("public/robots.txt", "User-agent: *\n");
  let result = build();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /public\/robots\.txt also provides it.*seo: \{ robots: false \}/u);
  await remove("public");

  await write("public/sitemap.xsl", "<x/>");
  result = build();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /public\/sitemap\.xsl also provides it.*seo: \{ sitemap: false \}/u);
  await remove("public");

  await write("public/sitemap/index.html", "<p>host</p>");
  result = build();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /writes \/sitemap\/ at build, and public\/sitemap\/index\.html also provides it.*htmlSitemap: false/u);
  await remove("public");

  // With the directory format, public/sitemap.html is another URL: no collision.
  await write("public/sitemap.html", "<p>host sitemap.html</p>");
  result = build();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(await readFile(join(root, "dist/sitemap.html"), "utf8"), "<p>host sitemap.html</p>");
  assert.match(await readFile(join(root, "dist/sitemap/index.html"), "utf8"), /<section aria-labelledby="sitemap-/u);
  await remove("public");
  await remove("dist");

  // A published content page at the same URL names the opt-out too.
  await write("src/content/page/en/sitemap.md", "---\ntitle: Site map\nslug: sitemap\nstatus: publish\nlocale: en\ntranslationKey: sitemap\n---\nBody.");
  result = build();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /at \/sitemap uses the URL of the SDK HTML sitemap page.*htmlSitemap: false/u);
  await remove("src/content/page/en/sitemap.md");

  await write("src/pages/sitemap.astro", "<html><body>host sitemap</body></html>");
  result = build();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /writes \/sitemap\/ at build, and the route \/sitemap .*htmlSitemap: false/u);
  await remove("src/pages/sitemap.astro");

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

test("htmlSitemap: false drops the page; the xsl takes its look from the home page", async () => {
  await write("astro.config.mjs", config({ seo: "{ htmlSitemap: false }" }));
  const result = build();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const dist = join(root, "dist");
  await assert.rejects(readFile(join(dist, "sitemap/index.html")), /ENOENT/u);
  await assert.rejects(readFile(join(dist, "de/sitemap/index.html")), /ENOENT/u);
  const xml = await readFile(join(dist, "sitemap.xml"), "utf8");
  assert.ok(!xml.includes("/docs/sitemap/"));
  const xsl = await readFile(join(dist, "sitemap.xsl"), "utf8");
  assert.ok(!xsl.includes("Sitemap page"));
  const home = await readFile(join(dist, "index.html"), "utf8");
  const css = [...home.slice(0, home.indexOf("</head>")).matchAll(/<link rel="stylesheet" href="([^"]+)"/gu)].map((match) => match[1]);
  for (const href of css) assert.ok(xsl.includes(`<link rel="stylesheet" href="${href}"/>`), href);
});

test("the dev server renders the pre-build list with a note instead of sentinels", async () => {
  await write("astro.config.mjs", config());
  // Away from the demo dev server (4322) and the dist server (4177).
  const port = 4500 + Math.floor(Math.random() * 400);
  const server = spawn(join(sdk, "node_modules/.bin/astro"), ["dev", "--port", String(port), "--host", "127.0.0.1"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (chunk) => (log += chunk));
  server.stderr.on("data", (chunk) => (log += chunk));
  try {
    let html = null;
    for (let attempt = 0; attempt < 120 && html === null; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const response = await fetch(`http://127.0.0.1:${port}/docs/sitemap/`);
        if (response.ok) html = await response.text();
      } catch {
        // The server is still starting.
      }
    }
    assert.ok(html, log);
    assert.ok(!html.includes("MOO_SITEMAP_"), "no sentinels in dev");
    assert.match(html, /class="alert alert-info" role="alert"/u);
    assert.match(html, /The development server lists published content and static routes only\./u);
    assert.match(html, /<a class="text-break" href="\/docs\/contact\/">contact<\/a>/u);
    assert.match(html, /href="\/docs\/sitemap\/"/u);
    assert.ok(!html.includes('href="/docs/de/contact/"'));
    const de = await (await fetch(`http://127.0.0.1:${port}/docs/de/sitemap/`)).text();
    assert.match(de, /<a class="text-break" href="\/docs\/de\/contact\/">contact<\/a>/u);
  } finally {
    server.kill("SIGTERM");
  }
});
