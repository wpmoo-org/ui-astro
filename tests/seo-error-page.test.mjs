// One error-page rule (src/seo/error-page.js) for both the Layout robots meta
// and the sitemap scan's "error page" exclusion. Each case of one table runs
// through the predicate, the scan and a Layout render.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { errorPageCodes, isErrorPage, isErrorPagePath } from "../packages/astro/src/seo/error-page.js";
import { collectSitemapEntries } from "../packages/astro/src/integration/sitemap.js";
import moo from "../packages/astro/src/integration/index.js";
import { createRenderer } from "./helpers/render-astro.mjs";

const source = (path) => readFileSync(new URL(`../packages/astro/src/${path}`, import.meta.url), "utf8");
const locales = ["en", "de"];
// [path relative to base, error page with locales en and de]
const cases = [
  ["/404", true], ["/404/", true], ["/404.html", true], ["/404/index.html", true], ["404", true],
  ["/500", true], ["/500/", true], ["/500.html", true],
  ["/de/404", true], ["/de/404/", true], ["/de/404.html", true], ["/de/404/index.html", true], ["/de/500/", true],
  ["/en/404/", true],
  ["/", false], ["/index.html", false], ["/blog/404/", false], ["/fr/404/", false], ["/de/404/x/", false],
  ["/404x/", false], ["/x404/", false], ["/de/", false], ["/de/de/404/", false], ["/4040/", false], ["/about/", false],
];

test("isErrorPagePath matches 404 and 500, plain or behind one known locale, in every built form", () => {
  assert.deepEqual(errorPageCodes, ["404", "500"]);
  for (const [path, expected] of cases) {
    assert.equal(isErrorPagePath(path, { locales }), expected, path);
    // A locale prefix needs that locale.
    if (path.split("/").filter(Boolean).length === 1) assert.equal(isErrorPagePath(path), expected, path);
  }
  assert.equal(isErrorPagePath("/de/404/"), false);
});

test("isErrorPagePath strips base first, in either base form", () => {
  for (const base of ["/docs", "/docs/", "docs"]) {
    for (const [path, expected] of cases) {
      const absolute = `/docs/${path.replace(/^\/+/u, "")}`;
      assert.equal(isErrorPagePath(absolute, { base, locales }), expected, `${base} ${absolute}`);
    }
    assert.equal(isErrorPagePath("/docs", { base, locales }), false);
  }
  // A path outside base is read as relative to base.
  assert.equal(isErrorPagePath("/404/", { base: "/docs" }), true);
  assert.equal(isErrorPagePath("/docs/docs/404/", { base: "/docs" }), false);
});

test("isErrorPage also takes a 404 or 500 response status", () => {
  assert.equal(isErrorPage({ path: "/missing/", status: 404 }), true);
  assert.equal(isErrorPage({ path: "/missing/", status: 500 }), true);
  assert.equal(isErrorPage({ path: "/missing/", status: 200 }), false);
  assert.equal(isErrorPage({ path: "/de/404/", locales: ["de"], status: 200 }), true);
  assert.equal(isErrorPage({ path: "/missing/" }), false);
});

test("Layout, the sitemap scan and the development sitemap list import the same predicate", () => {
  assert.match(source("layouts/Layout.astro"), /import \{ isErrorPage \} from "\.\.\/seo\/error-page\.js";/u);
  assert.match(source("integration/sitemap.js"), /import \{ isErrorPagePath \} from "\.\.\/seo\/error-page\.js";/u);
  assert.match(source("integration/index.js"), /import \{ isErrorPagePath \} from "\.\.\/seo\/error-page\.js";/u);
  // isErrorPage is isErrorPagePath plus the status.
  for (const [path, expected] of cases) assert.equal(isErrorPage({ path, locales }), expected, path);
});

test("the sitemap scan leaves out exactly the table's error pages", () => {
  const root = mkdtempSync(join(tmpdir(), "moo-error-page-"));
  try {
    const pathnames = [...new Set(cases.map(([path]) => path.replace(/^\/+/u, "").replace(/(?:^|\/)index\.html$/u, "").replace(/\.html$/u, "")))];
    for (const base of ["/", "/docs/"]) {
      const { left } = collectSitemapEntries({
        dir: root, pages: pathnames.map((pathname) => ({ pathname })), site: "https://example.test", base, trailingSlash: "always", locales,
      });
      const errors = new Set(left.filter((item) => item.reason === "error page").map((item) => item.path));
      for (const pathname of pathnames)
        assert.equal(errors.has(`/${pathname.replace(/\/+$/u, "")}`), isErrorPagePath(pathname, { locales }), pathname);
      assert.ok(errors.size > 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

let renderer;
before(async () => { renderer = await createRenderer(undefined, { stubIntegration: true }); });
after(async () => { await renderer?.close(); });

test("Layout writes one robots meta on exactly the table's error pages (no base, no locale)", async () => {
  const metadata = {
    title: "Missing", canonical: "https://example.test/missing/", openGraph: {}, twitter: {},
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage" },
  };
  for (const [path, expected] of cases.filter(([path]) => path.split("/").filter(Boolean).length <= 1)) {
    if (!path.startsWith("/")) continue;
    for (const noindex of [undefined, false, true]) {
      const html = await renderer.render("layouts/Layout.astro", {
        props: { title: "Missing", metadata, ...(noindex === undefined ? {} : { noindex }) },
        slots: { default: "<p>x</p>" },
        request: new Request(`https://example.test${path}`),
      });
      const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
      const robots = head.match(/<meta name="robots"[^>]*>/gu) ?? [];
      const noindexed = expected || noindex === true;
      assert.deepEqual(robots, noindexed ? ['<meta name="robots" content="noindex, follow">'] : [], `${path} ${noindex}`);
      assert.equal(head.includes("application/ld+json"), !noindexed, `${path} ${noindex}`);
    }
  }
});

test("an error page cannot be made indexable by metadata robots", async () => {
  const html = await renderer.render("layouts/Layout.astro", {
    props: { title: "Missing", metadata: { title: "Missing", canonical: "https://example.test/404/", openGraph: {}, twitter: {}, robots: "index, follow" }, noindex: false },
    slots: { default: "<p>x</p>" },
    request: new Request("https://example.test/404/"),
  });
  assert.deepEqual(html.match(/<meta name="robots"[^>]*>/gu), ['<meta name="robots" content="noindex, follow">']);
});

test("the development sitemap list drops error pages by the same rule", () => {
  const integration = moo({ plugins: [], notFound: { routeOwner: "host" }, site: { seo: { htmlSitemap: false } } });
  const root = new URL("./fixtures/ui-only/", import.meta.url);
  const config = {
    root, srcDir: new URL("src/", root), cacheDir: new URL(".astro/", root), vite: {}, site: "https://example.test",
    base: "/docs", trailingSlash: "always", output: "static", prerenderConflictBehavior: "error", integrations: [integration],
    i18n: { locales: ["en", "de"], defaultLocale: "en", routing: { prefixDefaultLocale: false } },
  };
  const updates = [];
  integration.hooks["astro:config:setup"]({ config, command: "build", injectRoute() {}, updateConfig: (value) => updates.push(value), addMiddleware() {} });
  integration.hooks["astro:config:done"]({ config, injectTypes() {} });
  const patterns = ["/404", "/de/404", "/500", "/de/500", "/blog/404", "/about", "/de/404/x"];
  const route = (pattern) => ({
    pattern, pathname: pattern, entrypoint: `src/pages${pattern}.astro`, type: "page", origin: "project",
    isPrerendered: true, patternRegex: new RegExp(`^${pattern}$`, "u"),
  });
  integration.hooks["astro:routes:resolved"]({ routes: patterns.map(route) });
  const guard = updates.flatMap((value) => value.vite?.plugins ?? []).find((plugin) => plugin.name === "wpmoo-astro-context");
  const source = guard.load("\0virtual:wpmoo-astro/sitemap", { ssr: true });
  const { staticPaths } = JSON.parse(source.slice("export default ".length, source.indexOf("; export const loadContent")));
  assert.deepEqual(staticPaths, patterns.filter((pattern) => !isErrorPagePath(pattern, { locales })));
  assert.deepEqual(staticPaths, ["/blog/404", "/about", "/de/404/x"]);
});
