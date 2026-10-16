"""Native locale routing and translation output from the real packed public API."""
import json
import unittest
import xml.etree.ElementTree as ET

import test_view_structure as native
from test_taxonomy_contract import CONFIG_IMPORTS, taxonomy_files


def localized_files():
    files = taxonomy_files()
    for path in list(files):
        if path.startswith("src/content/"):
            del files[path]
    for locale, slug in [("en", "contact"), ("de", "kontakt")]:
        files[f"src/content/page/{locale}/contact.md"] = f'---\ntitle: {locale.upper()} Contact\nslug: {slug}\nstatus: publish\nlocale: {locale}\ntranslationKey: contact\ntaxonomies:\n  category: [child]\n---\n{locale.upper()} page body.\n'
        files[f"src/content/post/{locale}/Über.md"] = f'---\ntitle: {locale.upper()} Article\nstatus: publish\nlocale: {locale}\ntranslationKey: article\npublished_at: "2026-09-20T12:00:00Z"\ntaxonomies:\n  category: [child]\n---\n{locale.upper()} post body.\n'
    files["src/content/page/en/standalone.md"] = '---\ntitle: Standalone\nstatus: publish\nlocale: en\n---\nStandalone body.\n'
    files["src/content/page/de/pending.md"] = '---\ntitle: Pending\nstatus: pending\nlocale: de\ntranslationKey: standalone\n---\nNot public.\n'
    terms = json.loads(files["src/data/category.json"])
    terms[1]["locales"] = {"de": {"name": "Localized category", "slug": "Äpfel"}}
    files["src/data/category.json"] = json.dumps(terms)
    definitions = files["src/definitions.mjs"].replace('label: "Categories",', 'label: "Categories", locales: { de: { label: "Topics", slug: "kategorie" } },')
    files["src/definitions.mjs"] = definitions
    files["tsconfig.json"] = json.dumps({"extends": "astro/tsconfigs/strict", "include": ["src/**/*", ".astro/types.d.ts"], "exclude": ["dist"]})
    return files


def configuration(*, base="/", slash="ignore", prefixed=False, host=False, default_locale="en"):
    page_options = 'routes: { single: "host" },' if host else ""
    return f'''site: "https://example.test", base: "{base}", trailingSlash: "{slash}",
i18n: {{ locales: ["en", "de"], defaultLocale: "{default_locale}", routing: {{ prefixDefaultLocale: {str(prefixed).lower()} }} }},
integrations: [moo({{ site: {{ defaults: {{ lang: "{default_locale}" }}, locales: {{ de: {{ dir: "rtl", parts: {{ loop: {{ emptyText: "Localized empty state." }}, header: {{ skipLabel: "Localized skip." }} }} }} }} }},
plugins: [page({{ {page_options} taxonomies: bindings }}), post({{ taxonomies: bindings, locales: {{ de: {{ label: "Localized articles", basePath: "/beitraege" }} }} }})], taxonomies }})]'''


PROJECT_IMPORTS = '''import { definePlugin } from "@wpmoo/astro/plugins";
const sample = definePlugin({ apiVersion: 1, id: "projects", label: "Projects", basePath: "/projects",
  locales: { de: { label: "Localized projects", basePath: "/projekte" } },
  contentTypes: [{ id: "project", collection: "project", singleRoute: "single",
    source: { kind: "json-directory", base: new URL("./src/data/project/", import.meta.url) }, taxonomies: bindings }],
  routes: [{ id: "single", pattern: "/[...slug]", prerender: true, owner: "host" }] });
'''

PROJECT_ROUTE = '''---
import type { GetStaticPathsOptions } from "astro";
import { getCollection } from "astro:content";
import { normalizeSlug, resolvePageOptions } from "@wpmoo/astro/config";
import { getEntryHref, getSiteContext } from "@wpmoo/astro/context";
import { getRouteLocale, getLanguageLinks } from "@wpmoo/astro/i18n";
import { resolveSeoMetadata } from "@wpmoo/astro/seo";
import Layout from "@wpmoo/astro/Layout.astro";
import Single from "@wpmoo/astro/views/Single.astro";
export async function getStaticPaths({ routePattern }: GetStaticPathsOptions) {
  const locale = getRouteLocale(routePattern);
  return (await getCollection("project")).filter(entry => entry.data.status === "publish" && entry.data.locale === locale)
    .map(entry => ({ params: { slug: normalizeSlug(entry.data.slug ?? entry.id, { lang: locale }) }, props: { entry } }));
}
const { entry } = Astro.props;
const { site } = getSiteContext();
const options = resolvePageOptions(site, "project", "single", entry.data.options, entry.data.locale);
const href = getEntryHref("project", entry);
const links = await getLanguageLinks("project", entry);
const metadata = resolveSeoMetadata(site, { title: entry.data.title, status: entry.data.status, type: "project", view: "single",
  lang: options.lang, url: new URL(href, Astro.site).href,
  alternates: links.map(link => ({ locale: link.locale, url: new URL(link.href, Astro.site).href })) });
const entryContext = { type: "project", id: entry.id, source: "json" as const, taxonomies: { category: ["child"] } };
---
<Layout title={entry.data.title} lang={options.lang} dir={options.dir} metadata={metadata} pageContext={{ view: "single", entry: entryContext }}>
  <Single title={entry.data.title} entryContext={entryContext}><p>Reusable project body.</p></Single>
</Layout>
'''


def project_files(*, prefixed=False):
    files = localized_files()
    files["src/content.config.mjs"] = files["src/content.config.mjs"].replace(
        'import { sourceEntryId, jsonEntryId }', 'import { entrySchema, sourceEntryId, jsonEntryId }').replace(
        'export const collections = {',
        'export const collections = { project: defineCollection({ loader: glob({ base: new URL("./data/project/", import.meta.url), pattern: "*.json", generateId: jsonEntryId }), schema: entrySchema.extend({ id: z.string(), ...relationships }) }),')
    for locale, slug in [("en", "project"), ("de", "projekt")]:
        files[f"src/data/project/{locale}-project.json"] = json.dumps({
            "id": f"{locale}-project", "title": f"{locale.upper()} Project", "status": "publish", "locale": locale,
            "slug": slug, "translationKey": "project", "taxonomies": {"category": ["child"]},
        })
    files[f'src/pages/{"en/" if prefixed else ""}projects/[...slug].astro'] = PROJECT_ROUTE
    files["src/pages/de/projekte/[...slug].astro"] = PROJECT_ROUTE
    return files


CONTENT_PROJECTION = '''import { getCollection } from "astro:content";
import { getEntryHref, getSiteContext } from "@wpmoo/astro/context";
import { getLanguageLinks, getLocaleHref } from "@wpmoo/astro/i18n";
import { getTaxonomyPaths } from "@wpmoo/astro/taxonomies/queries";
export const GET = async () => {
  const records = [];
  const absolute = href => new URL(href, "https://example.test").href;
  for (const type of ["page", "post", "project"]) {
    for (const entry of await getCollection(type)) {
      if (entry.data.status !== "publish") continue;
      records.push({ id: `${type}/${entry.id}`, url: absolute(getEntryHref(type, entry)),
        links: (await getLanguageLinks(type, entry)).map(link => ({ lang: link.locale, url: absolute(link.href) })) });
    }
  }
  const context = getSiteContext();
  for (const locale of context.i18n.locales) {
    for (const path of await getTaxonomyPaths({ locale })) {
      records.push({ id: `${path.props.taxonomy}/${path.props.term.id}/${locale}`, url: absolute(path.props.href),
        links: path.props.alternates.map(link => ({ lang: link.locale, url: absolute(link.href) })) });
    }
    records.push({ id: `post/archive/${locale}`, url: absolute(getLocaleHref(locale === "de" ? "/beitraege" : "/posts", locale)),
      links: context.i18n.locales.map(language => ({ lang: language, url: absolute(getLocaleHref(language === "de" ? "/beitraege" : "/posts", language)) })) });
  }
  return new Response(JSON.stringify(records), { headers: { "Content-Type": "application/json" } });
};'''

SITEMAP_IMPORTS = '''import sitemap from "@astrojs/sitemap";
import { readFile, stat } from "node:fs/promises";
let publicRecords;
const outputProjection = { name: "host-public-sitemap-projection", hooks: { "astro:build:done": async ({ dir }) => {
  const records = JSON.parse(await readFile(new URL("content-proof.json", dir), "utf8"));
  for (const record of records) {
    const path = new URL(record.url).pathname.replace(/^BASE/, "").replace(/^\\/+|\\/+$/g, "");
    await stat(new URL(path ? `${path}/index.html` : "index.html", dir));
  }
  publicRecords = new Map(records.map(record => [record.url.replace(/\\/$/, ""), record]));
} } };
const writer = sitemap({ customPages: ["https://example.test/de/missing"],
  filter: url => publicRecords.has(url.replace(/\\/$/, "")),
  serialize: item => { const record = publicRecords.get(item.url.replace(/\\/$/, "")); return { ...item, url: record.url, links: record.links }; },
});
'''


class NativeLocaleContracts(unittest.TestCase):
    build = native.PublicComponentRendering.build

    @classmethod
    def setUpClass(cls):
        native.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        native.PublicComponentRendering.tearDownClass.__func__(cls)

    def render(self, files=None, **options):
        return self.build(None, files=files or localized_files(), config_imports=CONFIG_IMPORTS,
                          configuration=configuration(**options))

    def test_optional_i18n_helpers_load_in_a_single_language_host(self):
        source = '''---
import Layout from "@wpmoo/astro/Layout.astro";
import { getCollection } from "astro:content";
import { getLocaleHref, getRouteLocale, getLanguageLinks } from "@wpmoo/astro/i18n";
const entry = (await getCollection("page")).find(value => value.id === "contact.md");
if (!entry) throw new Error("Missing Contact fixture");
const links = await getLanguageLinks("page", entry);
const language = getRouteLocale(Astro.routePattern);
const href = getLocaleHref("/contact", language);
if (links.length || language !== "en" || href !== "/docs/contact/") throw new Error("Single-language projection differs");
---
<Layout title="Optional native locales" lang={language}><p>{href}</p></Layout>'''
        files = taxonomy_files()
        files["tsconfig.json"] = json.dumps({"extends": "astro/tsconfigs/strict", "include": ["src/**/*", ".astro/types.d.ts"], "exclude": ["dist"]})
        result, html = self.build(source, files=files, check=True,
                                  config_imports=CONFIG_IMPORTS,
                                  configuration='site: "https://example.test", base: "/docs", trailingSlash: "always", integrations: [moo({ plugins: [page({ taxonomies: bindings }), post({ taxonomies: bindings })], taxonomies })]')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('<html lang="en" dir="ltr">', html)
        self.assertIn('/docs/contact/', html)
        self.assertIn('contact/index.html', result.generated_html)

    def test_private_locale_module_rejects_host_and_client_imports(self):
        cases = [
            ('---\nimport { getRelativeLocaleUrl } from "virtual:wpmoo-astro/i18n";\nconst href = getRelativeLocaleUrl("en", "contact");\n---\n<h1>{href}</h1>', "host SSR"),
            ('<h1>Private locale boundary</h1><script>import { getRelativeLocaleUrl } from "virtual:wpmoo-astro/i18n"; console.log(getRelativeLocaleUrl("en", "contact"));</script>', "client"),
        ]
        for source, caller in cases:
            with self.subTest(caller=caller):
                result, _ = self.build(source, files=localized_files(),
                                      config_imports=CONFIG_IMPORTS, configuration=configuration())
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("virtual:wpmoo-astro/i18n is private and server-only", result.stdout + result.stderr)

    def test_native_prefix_base_slash_profiles_and_reciprocal_translated_heads(self):
        for base in ["/", "/docs"]:
            for slash in ["always", "never", "ignore"]:
                for prefixed in [False, True]:
                    with self.subTest(base=base, slash=slash, prefixed=prefixed):
                        result, _ = self.render(base=base, slash=slash, prefixed=prefixed)
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                        root = "en/" if prefixed else ""
                        en_file = f"{root}contact/index.html"
                        de_file = "de/kontakt/index.html"
                        en_href = ("" if base == "/" else base) + f"/{root}contact" + ("/" if slash == "always" else "")
                        de_href = ("" if base == "/" else base) + "/de/kontakt" + ("/" if slash == "always" else "")
                        for filename, language, href in [(en_file, "en", en_href), (de_file, "de", de_href)]:
                            html = result.generated_html[filename]
                            parser = native.Markup()
                            parser.feed(html)
                            self.assertIn(("html", {"lang": language, "dir": "rtl" if language == "de" else "ltr"}), parser.elements)
                            alternates = {attrs["hreflang"]: attrs["href"] for tag, attrs in parser.elements if tag == "link" and attrs.get("rel") == "alternate"}
                            self.assertEqual(alternates, {"en": "https://example.test" + en_href, "de": "https://example.test" + de_href})
                            self.assertIn(("link", {"rel": "canonical", "href": "https://example.test" + href}), parser.elements)
                            self.assertEqual(sum(tag == "h1" for tag, _ in parser.elements), 1)
                        self.assertIn(f'{root}posts/uber/index.html', result.generated_html)
                        self.assertIn('de/beitraege/ueber/index.html', result.generated_html)
                        self.assertIn('de/topics/kategorie/aepfel/index.html', result.generated_html)
                        archive = result.generated_html['de/beitraege/index.html']
                        self.assertIn('DE Article', archive)
                        self.assertNotIn('EN Article', archive)
                        self.assertIn('de/beitraege/ueber', archive)
                        self.assertNotIn('rel="alternate"', result.generated_html[f'{root}standalone/index.html'])
                        self.assertFalse(any('pending' in path for path in result.generated_html))

    def test_configured_main_locale_uses_its_source_folder_without_a_url_prefix(self):
        files = localized_files()
        files["src/pages/locale-contract.json.ts"] = '''import { getCollection } from "astro:content";
import { getEntryHref, getSiteContext } from "@wpmoo/astro/context";
import { getLanguageLinks, getRouteLocale } from "@wpmoo/astro/i18n";
export const GET = async () => {
  const context = getSiteContext();
  if (!context.i18n) throw new Error("The locale contract requires native Astro i18n");
  return new Response(JSON.stringify({
  mainLocale: context.i18n.defaultLocale,
  routeLocale: getRouteLocale("/locale-contract.json"),
  entries: await Promise.all((await getCollection("page")).filter(entry => entry.data.status === "publish")
    .map(async entry => ({ id: entry.id, filePath: entry.filePath, href: getEntryHref("page", entry),
      links: await getLanguageLinks("page", entry) }))),
}), { headers: { "Content-Type": "application/json" } });
};'''
        for main_locale, page_href, translated_href, post_file, translated_post_file, taxonomy_file in [
            ("en", "/docs/contact/", "/docs/de/kontakt/", "posts/uber/index.html",
             "de/beitraege/ueber/index.html", "topics/category/child/index.html"),
            ("de", "/docs/kontakt/", "/docs/en/contact/", "beitraege/ueber/index.html",
             "en/posts/uber/index.html", "topics/kategorie/aepfel/index.html"),
        ]:
            with self.subTest(main_locale=main_locale):
                result, _ = self.build(None, files=files, check=True, config_imports=CONFIG_IMPORTS,
                                       configuration=configuration(base="/docs", slash="always", default_locale=main_locale))
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                contract = json.loads(result.generated_data["locale-contract.json"])
                self.assertEqual(contract["mainLocale"], main_locale)
                self.assertEqual(contract["routeLocale"], main_locale)
                entries = {entry["id"]: entry for entry in contract["entries"]}
                contact = entries[main_locale + "/contact.md"]
                self.assertEqual(contact["filePath"], "src/content/page/" + main_locale + "/contact.md")
                self.assertEqual(contact["href"], page_href)
                other_locale = "de" if main_locale == "en" else "en"
                self.assertEqual({link["locale"]: link["href"] for link in contact["links"]},
                                 {main_locale: page_href, other_locale: translated_href})
                filename = page_href.removeprefix("/docs/") + "index.html"
                parser = native.Markup()
                parser.feed(result.generated_html[filename])
                self.assertIn(("link", {"rel": "canonical", "href": "https://example.test" + page_href}), parser.elements)
                self.assertEqual({attrs["hreflang"]: attrs["href"] for tag, attrs in parser.elements
                                  if tag == "link" and attrs.get("rel") == "alternate"},
                                 {main_locale: "https://example.test" + page_href,
                                  other_locale: "https://example.test" + translated_href})
                for path in [post_file, translated_post_file, taxonomy_file]:
                    self.assertIn(path, result.generated_html)

    def test_host_single_cannot_omit_an_advertised_translation(self):
        files = localized_files()
        host = '''---
import Layout from "@wpmoo/astro/Layout.astro";
import { getPagePaths } from "@wpmoo/astro/plugins/page/queries";
export async function getStaticPaths() { return getPagePaths({ locale: "en", lang: "en" }); }
const { entry } = Astro.props;
---
<Layout title={entry.data.title}><p>Host-owned Page.</p></Layout>'''
        files["src/pages/[...slug].astro"] = host
        files["src/pages/de/[...slug].astro"] = host.replace('locale: "en", lang: "en"', 'locale: "de", lang: "de"').replace('return getPagePaths({ locale: "de", lang: "de" });', 'return [];')
        result, _ = self.render(files, host=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('published content page/de/contact.md has no emitted route at /de/kontakt', result.stdout + result.stderr)
        files["src/pages/de/[...slug].astro"] = host.replace('locale: "en", lang: "en"', 'locale: "de", lang: "de"')
        result, _ = self.render(files, host=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_host_archive_cannot_omit_terms_at_a_localized_prefix(self):
        files = localized_files()
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('slug: "kategorie"', 'basePath: "/kategorie"').replace('include: "descendants"', 'include: "descendants", basePath: "/c"').replace('archive: {}', 'archive: { basePath: "/c" }')
        route = '''---
import { getTaxonomyPaths } from "@wpmoo/astro/taxonomies/queries";
export function getStaticPaths({ routePattern }) { return getTaxonomyPaths({ routePattern }); }
---
<h1>Host archive</h1>'''
        files["src/pages/c/[slug].astro"] = route
        files["src/pages/de/c/[slug].astro"] = route
        files["src/pages/de/kategorie/[slug].astro"] = route.replace('return getTaxonomyPaths({ routePattern });', 'return [];')
        config = configuration(base="/docs", slash="never").replace('], taxonomies })', '], taxonomies, taxonomyRoutes: { archive: "host" } })')
        result, _ = self.build(None, configuration=config, files=files, config_imports=CONFIG_IMPORTS)
        self.assertNotEqual(result.returncode, 0)
        for evidence in ["category/child/de", "/de/kategorie/aepfel", "locale de", "no emitted route"]:
            self.assertIn(evidence, result.stdout + result.stderr)
        files["src/pages/de/kategorie/[slug].astro"] = route
        valid, _ = self.build(None, configuration=config, files=files, config_imports=CONFIG_IMPORTS)
        self.assertEqual(valid.returncode, 0, valid.stdout + valid.stderr)

    def test_each_real_locale_boundary_has_its_own_failure(self):
        cases = [
            ('locale: de', 'locale: fr', 'locale fr is not active'),
            ('translationKey: contact', 'translationKey: contact\noptions:\n  lang: en', 'options.lang'),
        ]
        for old, new, error in cases:
            with self.subTest(error=error):
                files = localized_files()
                files["src/content/page/de/contact.md"] = files["src/content/page/de/contact.md"].replace(old, new)
                result, _ = self.render(files)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(error.lower(), (result.stdout + result.stderr).lower())
        files = localized_files()
        files["src/content/page/de/duplicate.md"] = files["src/content/page/de/contact.md"].replace("slug: kontakt", "slug: different").replace("status: publish", "status: draft")
        result, _ = self.render(files)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("translationKey contact locale de has duplicate", result.stdout + result.stderr)

    def test_json_directory_type_keeps_ids_with_translated_host_routes(self):
        for prefixed in [False, True]:
            with self.subTest(prefixed=prefixed):
                config = configuration(base="/docs", slash="never", prefixed=prefixed).replace('})], taxonomies', '}), sample], taxonomies')
                result, _ = self.build(None, files=project_files(prefixed=prefixed), check=True,
                                      config_imports=CONFIG_IMPORTS + PROJECT_IMPORTS, configuration=config)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                root = "en/" if prefixed else ""
                pair = {"en": f"https://example.test/docs/{root}projects/project", "de": "https://example.test/docs/de/projekte/projekt"}
                for filename, language, identity in [(f"{root}projects/project/index.html", "en", "entry-project--en-project"),
                                                     ("de/projekte/projekt/index.html", "de", "entry-project--de-project")]:
                    html = result.generated_html[filename]
                    parser = native.Markup()
                    parser.feed(html)
                    self.assertIn(("html", {"lang": language, "dir": "rtl" if language == "de" else "ltr"}), parser.elements)
                    self.assertEqual(sum(tag == "h1" for tag, _ in parser.elements), 1)
                    self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in parser.elements), 1)
                    self.assertIn(identity, html)
                    self.assertEqual({attrs["hreflang"]: attrs["href"] for tag, attrs in parser.elements
                                      if tag == "link" and attrs.get("rel") == "alternate"}, pair)
                    self.assertIn(("link", {"rel": "canonical", "href": pair[language]}), parser.elements)
                archive = result.generated_html["de/topics/kategorie/aepfel/index.html"]
                for href in ["/docs/de/kontakt", "/docs/de/beitraege/ueber", "/docs/de/projekte/projekt"]:
                    self.assertIn(f'href="{href}"', archive)
                self.assertNotIn(f'href="/docs/{root}projects/project"', archive)

    def test_native_locale_status_and_source_integrity_use_a_controlled_clock(self):
        files = localized_files()
        files["src/content/page/en/release.md"] = '---\ntitle: Release\nstatus: publish\nlocale: en\ntranslationKey: release\n---\nPublished release.\n'
        files["src/content/page/de/release.md"] = '---\ntitle: Scheduled release\nstatus: future\nlocale: de\ntranslationKey: release\npublished_at: "2040-01-01T12:00:00Z"\n---\nScheduled body.\n'
        files["src/content/post/de/elapsed.md"] = '---\ntitle: Elapsed future\nstatus: future\nlocale: de\npublished_at: "2020-01-01T12:00:00Z"\n---\nElapsed body.\n'
        files["src/content/post/de/draft.md"] = '---\ntitle: Draft\nstatus: draft\nlocale: de\n---\nDraft body.\n'
        files["src/pages/status-proof.json.js"] = '''import { getCollection } from "astro:content";
import { getPublishedPages } from "@wpmoo/astro/plugins/page/queries";
import { getPublishedPosts } from "@wpmoo/astro/plugins/post/queries";
import { getLanguageLinks } from "@wpmoo/astro/i18n";
export const GET = async () => {
  const entry = (await getCollection("page")).find(value => value.id === "en/release.md");
  return new Response(JSON.stringify({ now: Date.now(), links: await getLanguageLinks("page", entry),
    pages: (await getPublishedPages({ locale: "de" })).map(value => value.id),
    posts: (await getPublishedPosts({ locale: "de" })).map(value => value.id) }));
};'''
        for date, instant in [("2030-01-01T00:00:00Z", 1893456000000), ("2041-01-01T00:00:00Z", 2240611200000)]:
            with self.subTest(clock=date):
                files["clock.mjs"] = f'Date.now = () => Date.parse("{date}");\n'
                result, _ = self.build(None, files=files, config_imports=CONFIG_IMPORTS + 'import "./clock.mjs";\n', configuration=configuration())
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                data = json.loads(result.generated_data["status-proof.json"])
                self.assertEqual(data, {"now": instant, "links": [{"locale": "en", "href": "/release"}],
                                        "pages": ["de/contact.md"], "posts": ["de/Über.md"]})
                for absent in ["de/release/index.html", "de/beitraege/elapsed/index.html", "de/beitraege/draft/index.html", "de/pending/index.html"]:
                    self.assertNotIn(absent, result.generated_html)
        files["src/content/page/de/pending.md"] = files["src/content/page/de/pending.md"].replace('translationKey: standalone', 'translationKey: standalone\ntaxonomies:\n  category: [absent]')
        result, _ = self.build(None, files=files, config_imports=CONFIG_IMPORTS + 'import "./clock.mjs";\n', configuration=configuration())
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("page de/pending.md taxonomies.category references missing term absent", result.stdout + result.stderr)

    def test_scheduled_localized_urls_reserve_their_real_namespace(self):
        files = localized_files()
        files["src/content/post/de/duplicate.md"] = '---\ntitle: Scheduled collision\nstatus: future\nlocale: de\nslug: Über\npublished_at: "2099-01-01T12:00:00Z"\n---\nScheduled body.\n'
        result, _ = self.render(files)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("post URL collision", result.stdout + result.stderr)
        self.assertIn("/de/beitraege/ueber", result.stdout + result.stderr)
        files.pop("src/content/post/de/duplicate.md")
        files["src/content/page/de/reserved.md"] = '---\ntitle: Reserved\nstatus: future\nlocale: de\nslug: beitraege/release\npublished_at: "2099-01-01T12:00:00Z"\n---\nReserved body.\n'
        result, _ = self.render(files)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("inside reserved namespace /beitraege", result.stdout + result.stderr)

    def test_optional_sitemap_serializes_actual_public_translation_graph(self):
        sitemap_package = native.ROOT / "node_modules/@astrojs/sitemap/package.json"
        if not sitemap_package.is_file():
            self.skipTest("Run the approved optional Sitemap profile to certify XML output")
        self.assertEqual(json.loads(sitemap_package.read_text())["version"], "3.7.4")
        pairs = [
            ("contact", "de/kontakt"), ("posts/uber", "de/beitraege/ueber"),
            ("projects/project", "de/projekte/projekt"), ("posts", "de/beitraege"),
            ("topics/category/parent", "de/topics/kategorie/parent"),
            ("topics/category/child", "de/topics/kategorie/aepfel"),
            ("topics/tag/astro", "de/topics/tag/astro"), ("topics/tag/empty", "de/topics/tag/empty"),
        ]
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "x": "http://www.w3.org/1999/xhtml"}
        for base in ["/", "/docs"]:
            for slash in ["always", "never", "ignore"]:
                with self.subTest(base=base, slash=slash):
                    files = project_files()
                    files["src/pages/content-proof.json.js"] = CONTENT_PROJECTION
                    config = configuration(base=base, slash=slash).replace('})], taxonomies', '}), sample], taxonomies').replace('taxonomies })]', 'taxonomies }), outputProjection, writer]')
                    mount_regex = "\\/" if base == "/" else "\\/docs"
                    result, _ = self.build(None, files=files, config_imports=CONFIG_IMPORTS + PROJECT_IMPORTS + SITEMAP_IMPORTS.replace("BASE", mount_regex),
                                          configuration=config, extra_modules=("@astrojs/sitemap",))
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    prefix = "https://example.test" + ("" if base == "/" else base) + "/"
                    suffix = "/" if slash == "always" else ""
                    expected_links = {}
                    for en, de in pairs:
                        links = {("en", prefix + en + suffix), ("de", prefix + de + suffix)}
                        expected_links[prefix + en + suffix] = links
                        expected_links[prefix + de + suffix] = links
                    expected_links[prefix + "standalone" + suffix] = set()
                    xml = ET.fromstring(result.generated_data["sitemap-0.xml"])
                    rows = xml.findall("s:url", ns)
                    actual = {row.findtext("s:loc", namespaces=ns): {(link.attrib["hreflang"], link.attrib["href"])
                              for link in row.findall("x:link", ns)} for row in rows}
                    self.assertEqual(actual, expected_links)
                    self.assertEqual(len(rows), len(expected_links))
                    for url in actual:
                        local_path = url.removeprefix(prefix).removesuffix("/")
                        self.assertIn(local_path + "/index.html", result.generated_html)
                    self.assertFalse(any("pending" in url or "missing" in url for url in actual))


if __name__ == "__main__":
    unittest.main()
