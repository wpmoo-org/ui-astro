"""Taxonomy source, reference, query and URL contracts through a real npm archive."""

import json
import unittest

import test_view_structure as native


CONFIG_IMPORTS = '''import { post } from "@wpmoo/astro/plugins/post";
import { defineTaxonomy } from "@wpmoo/astro/taxonomies";
import { taxonomies, bindings } from "./src/definitions.mjs";
'''


def taxonomy_files(*, archive=True, directory=False):
    definitions = '''import { defineTaxonomy } from "@wpmoo/astro/taxonomies";
export const bindings = ["category", "tag"];
export const taxonomies = [
  defineTaxonomy({ id: "category", label: "Categories", source: new URL("./data/categorySOURCE", import.meta.url), KIND hierarchical: true, archive: ARCHIVE }),
  defineTaxonomy({ id: "tag", label: "Tags", source: new URL("./data/tag.json", import.meta.url), archive: ARCHIVE_TAG }),
];
'''.replace("categorySOURCE", "category/" if directory else "category.json").replace("KIND", 'sourceKind: "json-directory",' if directory else "").replace("ARCHIVE_TAG", "{}" if archive else "false").replace("ARCHIVE", '{ include: "descendants" }' if archive else "false")
    files = {
        "src/definitions.mjs": definitions,
        "src/content.config.mjs": '''import { defineCollection, reference } from "astro:content";
import { glob, file } from "astro/loaders";
import { fileURLToPath } from "node:url";
import { z } from "astro/zod";
import { sourceEntryId, jsonEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
import { postSchema } from "@wpmoo/astro/plugins/post/content";
import { termSchema } from "@wpmoo/astro/taxonomies/content";
import { taxonomies } from "./definitions.mjs";
const relationships = { taxonomies: z.object({ category: z.array(reference("category")).default([]), tag: z.array(reference("tag")).default([]) }).strict().optional() };
export const collections = {
  page: defineCollection({ loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: pageSchema.extend(relationships) }),
  post: defineCollection({ loader: glob({ base: new URL("./content/post/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: postSchema.extend(relationships) }),
  ...Object.fromEntries(taxonomies.map(taxonomy => [taxonomy.id, defineCollection({ schema: termSchema, loader: taxonomy.sourceKind === "json-directory"
    ? glob({ base: new URL(taxonomy.source), pattern: "*.json", generateId: jsonEntryId }) : file(fileURLToPath(new URL(taxonomy.source))) })])),
};
''',
        "src/data/tag.json": json.dumps([{"id": "astro", "name": "Astro", "slug": "Astro"}, {"id": "empty", "name": "Empty tag", "slug": "empty"}]),
        "src/content/page/contact.md": "---\ntitle: Contact\nstatus: publish\ntaxonomies:\n  category: [child]\n  tag: [astro]\n---\nContact body.\n",
        "src/content/post/announcement.md": '---\ntitle: Announcement\nstatus: publish\npublished_at: "2026-09-20T12:00:00Z"\ntaxonomies:\n  category: [root, child]\n  tag: [astro]\n---\nPost body.\n',
        "src/content/post/draft.md": "---\ntitle: Draft\nstatus: draft\ntaxonomies:\n  category: [child]\n---\nDraft body.\n",
    }
    terms = [{"id": "root", "name": "Parent category", "slug": "parent"}, {"id": "child", "name": "Child category", "slug": "child", "parent": "root"}]
    if directory:
        for term in terms:
            files[f'src/data/category/{term["id"]}.json'] = json.dumps(term)
    else:
        files["src/data/category.json"] = json.dumps(terms)
    return files


class TaxonomyContracts(unittest.TestCase):
    build = native.PublicComponentRendering.build

    @classmethod
    def setUpClass(cls):
        native.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        native.PublicComponentRendering.tearDownClass.__func__(cls)

    def taxonomy_build(self, files, *, configuration=None, source=None, check=False):
        return self.build(source, configuration=configuration or 'base: "/docs", trailingSlash: "always", integrations: [moo({ plugins: [page({ taxonomies: bindings }), post({ taxonomies: bindings })], taxonomies })]',
                          config_imports=CONFIG_IMPORTS, files=files, check=check)

    def test_shared_archives_use_native_references_canonical_links_and_current_term_context(self):
        result, _ = self.taxonomy_build(taxonomy_files())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        archive = result.generated_html["topics/category/parent/index.html"]
        elements = native.Markup()
        elements.feed(archive)
        roots = [attrs for _, attrs in elements.elements if attrs.get("data-moo-document-owner") == "true"]
        self.assertEqual(len(roots), 1)
        self.assertEqual(roots[0]["class"].split(), ["moo-ui", "archive", "category", "category-root"])
        self.assertIn('href="/docs/contact/"', archive)
        self.assertEqual(archive.count('href="/docs/posts/announcement/"'), 1)
        self.assertIn('datetime="2026-09-20T12:00:00.000Z"', archive)
        self.assertIn("category-child", archive)
        self.assertNotIn("Draft body.", archive)
        self.assertIn("No items yet.", result.generated_html["topics/tag/empty/index.html"])
        child = result.generated_html["topics/category/child/index.html"]
        self.assertIn('href="/docs/topics/category/parent/"', child)
        self.assertIn("Categories: Child", child)
        self.assertNotIn('href="#"', child, "No taxonomy index route is generated")
        single = result.generated_html["posts/announcement/index.html"]
        self.assertIn("category-child", single)
        self.assertIn("category-root", single)
        self.assertIn("tag-astro", single)

    def test_explicit_nonroot_archives_use_actual_route_selectors_and_release_legacy_namespace(self):
        files = taxonomy_files()
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('include: "descendants"', 'include: "descendants", basePath: "/c"').replace('archive: {}', 'archive: { basePath: "/c" }')
        files["src/content/page/about.md"] = "---\ntitle: About\nstatus: publish\nslug: topics/about\n---\nAbout body.\n"
        files["src/pages/paths.json.ts"] = '''import { getTaxonomyPaths } from "@wpmoo/astro/taxonomies/queries";
export const GET = async () => Response.json(await getTaxonomyPaths({ routePattern: "/c/[slug]" }));
'''
        result, _ = self.taxonomy_build(files)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"contact/index.html", "topics/about/index.html", "posts/index.html", "posts/announcement/index.html", "c/parent/index.html", "c/child/index.html", "c/astro/index.html", "c/empty/index.html"})
        paths = json.loads(result.generated_data["paths.json"])
        self.assertEqual({path["routePattern"] for path in paths}, {"/c/[slug]"})
        self.assertEqual({path["props"]["href"] for path in paths}, {"/docs/c/parent/", "/docs/c/child/", "/docs/c/astro/", "/docs/c/empty/"})
        self.assertTrue(all(set(path["params"]) == {"slug"} for path in paths))
        self.assertIn('href="/docs/c/parent/"', result.generated_html["c/child/index.html"])
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('include: "descendants", basePath: "/c"', 'include: "descendants"')
        legacy, _ = self.taxonomy_build(files)
        self.assertNotEqual(legacy.returncode, 0)
        self.assertIn("inside reserved namespace /topics", legacy.stdout + legacy.stderr)

    def test_explicit_archive_locale_override_and_selector_mismatch(self):
        from test_i18n_contract import localized_files, configuration
        files = localized_files()
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('slug: "kategorie"', 'basePath: "/kategorie"').replace('include: "descendants"', 'include: "descendants", basePath: "/c"')
        result, _ = self.build(None, files=files, config_imports=CONFIG_IMPORTS, configuration=configuration(base="/docs", slash="always"))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("c/child/index.html", result.generated_html)
        self.assertIn("de/kategorie/aepfel/index.html", result.generated_html)
        self.assertIn('href="https://example.test/docs/c/child/"', result.generated_html["de/kategorie/aepfel/index.html"])
        files["src/pages/paths.json.ts"] = '''import { getTaxonomyPaths } from "@wpmoo/astro/taxonomies/queries";
export const GET = async () => Response.json(await getTaxonomyPaths({ routePattern: "/de/kategorie/[slug]", locale: "en" }));
'''
        invalid, _ = self.build(None, files=files, config_imports=CONFIG_IMPORTS, configuration=configuration())
        self.assertNotEqual(invalid.returncode, 0)
        self.assertIn("routePattern /de/kategorie/[slug] locale de disagrees with locale en", invalid.stdout + invalid.stderr)

    def test_root_archives_and_pages_have_one_producer(self):
        files = taxonomy_files()
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('include: "descendants"', 'include: "descendants", basePath: "/"').replace('archive: {}', 'archive: { basePath: "/" }')
        terms = json.loads(files["src/data/category.json"])
        terms[0]["slug"] = "layouts"
        terms[1]["slug"] = "guides"
        files["src/data/category.json"] = json.dumps(terms)
        files["src/content/page/index.md"] = "---\ntitle: Home\nstatus: publish\n---\nHome body.\n"
        files["src/content/page/guide/setup.md"] = "---\ntitle: Setup\nstatus: publish\n---\nSetup body.\n"
        files["src/pages/root.json.ts"] = '''import { getRootPaths, type RootPath } from "@wpmoo/astro/context";
export const GET = async () => { const paths: RootPath[] = await getRootPaths(); return Response.json(paths.map(path => ({ slug: path.params.slug ?? null, kind: path.props.kind }))); };
'''
        files["tsconfig.json"] = json.dumps({"extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "src/**/*"], "exclude": ["dist"]})
        config = 'site: "https://example.test", base: "/docs", trailingSlash: "always", integrations: [moo({ plugins: [page({ taxonomies: bindings })], taxonomies })]'
        for owner in ["plugin", "host"]:
            with self.subTest(owner=owner):
                selected = files.copy()
                configuration = config
                if owner == "host":
                    configuration = config.replace('page({ taxonomies:', 'page({ routes: { single: "host" }, taxonomies:').replace('], taxonomies })', '], taxonomies, taxonomyRoutes: { archive: "host" } })')
                    selected["src/pages/[...slug].astro"] = '''---
import type { GetStaticPathsOptions } from "astro";
import { render } from "astro:content";
import { getRootPaths, type RootPath } from "@wpmoo/astro/context";
import { getRouteLocale } from "@wpmoo/astro/i18n";
import Layout from "@wpmoo/astro/Layout.astro";
import Page from "@wpmoo/astro/plugins/page/views/Single.astro";
import Archive from "@wpmoo/astro/views/Archive.astro";
export const prerender = true;
export function getStaticPaths({ routePattern }: GetStaticPathsOptions) { return getRootPaths({ locale: getRouteLocale(routePattern) }); }
type Props = RootPath["props"];
const props = Astro.props;
const Content = props.kind === "page" ? (await render(props.entry)).Content : null;
---
<Layout title={props.kind === "page" ? props.entry.data.title : props.term.name}>
  {props.kind === "page" ? <Page entry={props.entry}>{Content && <Content />}</Page> : <Archive title={props.term.name} items={[...props.items]} />}
</Layout>
'''
                result, _ = self.build(None, files=selected, config_imports=CONFIG_IMPORTS, configuration=configuration, check=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(set(result.generated_html), {"index.html", "contact/index.html", "guide/setup/index.html", "layouts/index.html", "guides/index.html", "astro/index.html", "empty/index.html"})
                contract = json.loads(result.generated_data["root.json"])
                self.assertEqual({(item["slug"], item["kind"]) for item in contract}, {(None, "page"), ("contact", "page"), ("guide/setup", "page"), ("layouts", "taxonomy"), ("guides", "taxonomy"), ("astro", "taxonomy"), ("empty", "taxonomy")})
                self.assertIn("Setup body.", result.generated_html["guide/setup/index.html"])
                self.assertIn("No items yet.", result.generated_html["empty/index.html"])
                for html in result.generated_html.values():
                    markup = native.Markup(); markup.feed(html)
                    self.assertEqual(sum(tag == "main" for tag, _ in markup.elements), 1)
                    self.assertEqual(sum(tag == "html" for tag, _ in markup.elements), 1)
                    self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in markup.elements), 1)

    def test_root_taxonomy_only_empty_and_mixed_locale_producers(self):
        files = taxonomy_files()
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('include: "descendants"', 'include: "descendants", basePath: "/"').replace('archive: {}', 'archive: { basePath: "/" }')
        config = 'integrations: [moo({ plugins: [], taxonomies })]'
        result, _ = self.taxonomy_build(files, configuration=config)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"parent/index.html", "child/index.html", "astro/index.html", "empty/index.html"})
        files["src/data/category.json"] = files["src/data/tag.json"] = "[]"
        empty, _ = self.taxonomy_build(files, configuration=config)
        self.assertEqual(empty.returncode, 0, empty.stdout + empty.stderr)
        self.assertEqual(empty.generated_html, {})
        from test_i18n_contract import localized_files, configuration
        files = localized_files()
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('slug: "kategorie"', 'basePath: "/"').replace('include: "descendants"', 'include: "descendants", basePath: "/c"')
        mixed, _ = self.build(None, files=files, config_imports=CONFIG_IMPORTS, configuration=configuration())
        self.assertEqual(mixed.returncode, 0, mixed.stdout + mixed.stderr)
        for path in ["contact/index.html", "c/child/index.html", "de/kontakt/index.html", "de/aepfel/index.html"]:
            self.assertIn(path, mixed.generated_html)
        self.assertFalse(any(path.startswith("de/c/") or "kategorie/" in path for path in mixed.generated_html))

    def test_data_only_terms_and_explicit_host_archive_paths_share_public_types(self):
        source = '''---
import Layout from "@wpmoo/astro/Layout.astro";
import { getTaxonomyTerms, getTermEntries, getTaxonomyPaths, type TermItem } from "@wpmoo/astro/taxonomies/queries";
import { getSiteContext } from "@wpmoo/astro/context";
const terms = await getTaxonomyTerms("category");
const direct: readonly TermItem[] = await getTermEntries("category", "root");
const descendants = await getTermEntries("category", "root", { include: "descendants" });
const defaults = await getTaxonomyPaths();
const hostPaths = await getTaxonomyPaths({ taxonomies: ["category"] });
if (terms.map(term => term.id).join() !== "child,root" || direct.length !== 1 || descendants.length !== 2 || defaults.length !== 0 || hostPaths.length !== 2) throw new Error("Taxonomy query contract differs");
if (descendants[0].entryContext.taxonomies?.category.join() !== "child" || descendants[0].href !== "/docs/contact/") throw new Error("Mixed item contract differs");
if (JSON.stringify(getSiteContext()).includes("src/data/")) throw new Error("Public context leaks source location");
---
<Layout title="Public taxonomy data"><p>{terms.length} terms; {descendants.length} published items.</p></Layout>
'''
        files = taxonomy_files(archive=False)
        files["tsconfig.json"] = json.dumps({"extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "**/*"], "exclude": ["dist"]})
        result, html = self.taxonomy_build(files, source=source, check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("2 terms; 2 published items.", html)
        self.assertFalse(any(path.startswith("topics/") for path in result.generated_html))

    def test_localized_slug_custom_mount_and_host_policy_share_one_canonical_producer(self):
        for lang, raw, expected, trailing in [("de", "Äpfel", "aepfel", "never"), ("tr", "Çözümler", "cozumler", "always")]:
            with self.subTest(lang=lang):
                files = taxonomy_files()
                terms = json.loads(files["src/data/category.json"])
                terms[0]["slug"] = raw
                files["src/data/category.json"] = json.dumps(terms)
                configuration = f'base: "/docs", trailingSlash: "{trailing}", integrations: [moo({{ site: {{ defaults: {{ lang: "{lang}" }} }}, plugins: [page({{ taxonomies: bindings }}), post({{ taxonomies: bindings }})], taxonomies, taxonomyBasePath: "/subjects" }})]'
                result, _ = self.taxonomy_build(files, configuration=configuration)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(f"subjects/category/{expected}/index.html", result.generated_html)
                suffix = "/" if trailing == "always" else ""
                self.assertIn(f'href="/docs/subjects/category/{expected}{suffix}"', result.generated_html["subjects/category/child/index.html"])
                self.assertIn("category-root", result.generated_html[f"subjects/category/{expected}/index.html"])

    def test_actual_invalid_sources_graphs_and_references_have_fatal_owner_diagnostics(self):
        cases = [
            ("malformed", "category malformed JSON source"),
            ("map", "category JSON source must contain an array"),
            ("duplicate", "category contains multiple entries with the same slug: `root`"),
            ("cycle", "category parent cycle"),
            ("slug", "category term URL collision"),
            ("refs", "taxonomies.category has duplicate term child"),
            ("wrong-collection", "Expected category. Received tag"),
            ("missing-directory", "category missing JSON source directory"),
            ("filename", "JSON entry filename must exactly match"),
        ]
        for violation, diagnostic in cases:
            with self.subTest(violation=violation):
                directory = violation in ("missing-directory", "filename")
                files = taxonomy_files(archive=False, directory=directory)
                if violation == "malformed": files["src/data/category.json"] = "["
                elif violation == "map": files["src/data/category.json"] = json.dumps({"root": {"id": "root", "name": "Root", "slug": "root"}})
                elif violation == "duplicate":
                    values = json.loads(files["src/data/category.json"])
                    files["src/data/category.json"] = json.dumps(values + [values[0]])
                elif violation in ("cycle", "slug"):
                    values = json.loads(files["src/data/category.json"])
                    if violation == "cycle": values[0]["parent"] = "child"
                    else: values[1]["slug"] = "parent"
                    files["src/data/category.json"] = json.dumps(values)
                elif violation == "refs": files["src/content/post/draft.md"] = files["src/content/post/draft.md"].replace("[child]", "[child, child]")
                elif violation == "wrong-collection": files["src/content/post/draft.md"] = files["src/content/post/draft.md"].replace("[child]", "[{collection: tag, id: child}]")
                elif violation == "missing-directory":
                    files.pop("src/data/category/root.json")
                    files.pop("src/data/category/child.json")
                else: files["src/data/category/wrong.json"] = files.pop("src/data/category/root.json")
                result, _ = self.taxonomy_build(files)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(diagnostic, result.stdout + result.stderr)

    def test_enabled_archives_reserve_their_namespace_and_default_route_has_one_owner(self):
        for violation, diagnostic in [("page", "inside reserved namespace /topics"), ("pattern", "multiple resolved owners"), ("concrete", "conflict")]:
            with self.subTest(violation=violation):
                files = taxonomy_files()
                if violation == "page": files["src/content/page/conflict.md"] = "---\ntitle: Conflict\nstatus: publish\nslug: topics/custom\n---\nConflict.\n"
                elif violation == "pattern": files["src/pages/topics/[taxonomy]/[slug].astro"] = '---\nexport function getStaticPaths() { return []; }\n---\n<p>Host archive</p>'
                else: files["src/pages/topics/category/parent.astro"] = "<p>Conflicting host page</p>"
                result, _ = self.taxonomy_build(files)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(diagnostic, (result.stdout + result.stderr).lower() if violation == "concrete" else result.stdout + result.stderr)

    def test_custom_taxonomy_and_json_cpt_are_shared_mixed_data_without_a_new_renderer(self):
        files = taxonomy_files()
        files["src/definitions.mjs"] = '''import { defineTaxonomy } from "@wpmoo/astro/taxonomies";
export const bindings = ["sector"];
export const taxonomies = [defineTaxonomy({ id: "sector", label: "Sectors", source: new URL("./data/sector.json", import.meta.url), archive: {} })];
'''
        files["src/data/sector.json"] = json.dumps([{"id": "education", "name": "Education", "slug": "education"}])
        files["src/content.config.mjs"] = files["src/content.config.mjs"].replace('const relationships = { taxonomies:', 'const relationships = { taxonomies:').replace('category: z.array(reference("category")).default([]), tag: z.array(reference("tag")).default([])', 'sector: z.array(reference("sector")).default([])')
        files["src/content.config.mjs"] = files["src/content.config.mjs"].replace('import { sourceEntryId, jsonEntryId }', 'import { entrySchema, sourceEntryId, jsonEntryId }')
        files["src/content.config.mjs"] = files["src/content.config.mjs"].replace('export const collections = {', 'export const collections = { project: defineCollection({ loader: file("src/data/project.json"), schema: entrySchema.extend({ id: z.string(), ...relationships }) }),')
        for path in ["src/content/page/contact.md", "src/content/post/announcement.md", "src/content/post/draft.md"]:
            files[path] = files[path].replace("category: [root, child]", "sector: [education]").replace("category: [child]", "sector: [education]").replace("  tag: [astro]\n", "")
        preferences = {"sidebar": None, "headerWidth": None, "parts": {"content": {"utilities": []}}}
        files["src/data/project.json"] = json.dumps([{"id": "contact", "title": "Reusable project", "status": "publish", "options": preferences, "taxonomies": {"sector": ["education"]}}])
        files["src/pages/projects/[...slug].astro"] = '''---
import { getCollection } from "astro:content";
import { getSiteContext } from "@wpmoo/astro/context";
import { resolvePageOptions } from "@wpmoo/astro/config";
import Layout from "@wpmoo/astro/Layout.astro";
import Single from "@wpmoo/astro/views/Single.astro";
export async function getStaticPaths() { return (await getCollection("project")).map(entry => ({ params: { slug: entry.id }, props: { entry } })); }
const { entry } = Astro.props;
const { site } = getSiteContext();
const { sidebar: _sidebar, ...options } = resolvePageOptions(site, "project", "single", entry.data.options);
---
<Layout title={entry.data.title} {...options}><Single title={entry.data.title} parts={options.parts}><p>Reusable project body.</p></Single></Layout>
'''
        files["src/pages/project-data.json.ts"] = '''import { getCollection } from "astro:content";
export const GET = async () => Response.json((await getCollection("project"))[0].data.options);
'''
        imports = CONFIG_IMPORTS + '''import { definePlugin } from "@wpmoo/astro/plugins";
const sample = definePlugin({ apiVersion: 1, id: "projects", label: "Projects", basePath: "/projects", contentTypes: [{ id: "project", collection: "project", singleRoute: "single", source: { kind: "json", file: new URL("./src/data/project.json", import.meta.url) }, taxonomies: bindings }], routes: [{ id: "single", pattern: "/[...slug]", prerender: true, owner: "host" }] });
'''
        configuration = 'integrations: [moo({ site: { types: { project: { sidebar: {}, parts: { content: { utilities: ["py-5"] } } } } }, plugins: [page({ taxonomies: bindings }), post({ taxonomies: bindings }), sample], taxonomies })]'
        result, _ = self.build(None, configuration=configuration, config_imports=imports, files=files)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        archive = result.generated_html["topics/sector/education/index.html"]
        for href in ["/contact", "/posts/announcement", "/projects/contact"]:
            self.assertIn(f'href="{href}"', archive)
        markup = native.Markup()
        markup.feed(archive)
        for marker in ["page-contact", "post-announcement", "entry-project--contact"]:
            self.assertEqual(sum(tag == "li" and marker in attrs.get("class", "").split() for tag, attrs in markup.elements), 1)
        self.assertIn("entry-project--contact", archive)
        self.assertIn("tax-sector--education", archive)
        self.assertIn("Reusable project", archive)
        self.assertEqual(json.loads(result.generated_data["project-data.json"]), preferences)
        single = native.Markup()
        single.feed(result.generated_html["projects/contact/index.html"])
        self.assertFalse(any(tag == "aside" for tag, _ in single.elements))
        self.assertEqual(next(attrs["class"] for _, attrs in single.elements if "data-page-container" in attrs), "container-xl")
        record = json.loads(files["src/data/project.json"])[0]
        record["layout"] = record.pop("options")
        files["src/data/project.json"] = json.dumps([record])
        legacy, _ = self.build(None, configuration=configuration, config_imports=imports, files=files)
        self.assertNotEqual(legacy.returncode, 0, legacy.stdout + legacy.stderr)
        self.assertIn('"layout"', legacy.stdout + legacy.stderr)
        self.assertIn('"options"', legacy.stdout + legacy.stderr)

    def test_array_and_directory_term_storage_preserve_membership_and_urls(self):
        arrays, _ = self.taxonomy_build(taxonomy_files())
        directory, _ = self.taxonomy_build(taxonomy_files(directory=True))
        self.assertEqual(arrays.returncode, 0, arrays.stdout + arrays.stderr)
        self.assertEqual(directory.returncode, 0, directory.stdout + directory.stderr)
        self.assertEqual(set(arrays.generated_html), set(directory.generated_html))
        for path in arrays.generated_html:
            self.assertEqual(arrays.generated_html[path], directory.generated_html[path], path)

    def test_no_output_and_disabled_archives_cannot_skip_parent_or_reference_validation(self):
        for violation, diagnostic in [("parent", "unknown parent missing"), ("reference", "references missing term missing")]:
            with self.subTest(violation=violation):
                files = taxonomy_files(archive=False)
                files["src/content/page/contact.md"] = files["src/content/page/contact.md"].replace("status: publish", "status: draft")
                files["src/content/post/announcement.md"] = files["src/content/post/announcement.md"].replace("status: publish", "status: draft")
                if violation == "parent":
                    terms = json.loads(files["src/data/category.json"])
                    terms[1]["parent"] = "missing"
                    files["src/data/category.json"] = json.dumps(terms)
                else:
                    files["src/content/post/draft.md"] = files["src/content/post/draft.md"].replace("[child]", "[missing]")
                result, _ = self.taxonomy_build(files)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(diagnostic, result.stdout + result.stderr)

    def test_selected_empty_terms_are_valid_and_inactive_families_need_no_sources(self):
        files = {"src/content.config.mjs": 'import { defineCollection } from "astro:content"; import { file } from "astro/loaders"; import { termSchema } from "@wpmoo/astro/taxonomies/content"; export const collections = { tag: defineCollection({ loader: file("src/data/tag.json"), schema: termSchema }) };', "src/data/tag.json": "[]"}
        result, _ = self.build(None, configuration='integrations: [moo({ plugins: [], taxonomies: [defineTaxonomy({ id: "tag", label: "Tags", source: new URL("./src/data/tag.json", import.meta.url), archive: {} })] })]', config_imports='import { defineTaxonomy } from "@wpmoo/astro/taxonomies";', files=files)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.generated_html, {})

    def test_root_collision_names_both_sources(self):
        from test_i18n_contract import localized_files, configuration
        files = localized_files()
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('include: "descendants"', 'include: "descendants", basePath: "/"').replace('slug: "kategorie"', 'basePath: "/"')
        terms = json.loads(files["src/data/category.json"])
        terms[0]["slug"] = "layouts"
        files["src/data/category.json"] = json.dumps(terms)
        files["src/content/page/en/layouts.md"] = "---\ntitle: Layouts\nstatus: publish\nlocale: en\n---\nLayouts body.\n"
        result, _ = self.build(None, files=files, config_imports=CONFIG_IMPORTS, configuration=configuration(base="/docs", slash="always"))
        self.assertNotEqual(result.returncode, 0)
        output = result.stdout + result.stderr
        for evidence in ["URL collision", "locale en", "/docs/layouts/", "page/en/layouts.md", "category/root"]:
            self.assertIn(evidence, output)

    def test_archive_collisions_across_generic_taxonomies_and_locale_normalization(self):
        for first, second in [("category", "tag"), ("category", "sector"), ("tag", "sector")]:
            with self.subTest(first=first, second=second):
                files = taxonomy_files()
                files["src/definitions.mjs"] += '\nexport const sector = defineTaxonomy({ id: "sector", label: "Sectors", source: new URL("./data/sector.json", import.meta.url), archive: { basePath: "/c" } });\ntaxonomies.push(sector);\n'
                files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('include: "descendants"', 'include: "descendants", basePath: "/c"').replace('archive: {}', 'archive: { basePath: "/c" }')
                for taxonomy in ["category", "tag", "sector"]:
                    files[f"src/data/{taxonomy}.json"] = json.dumps([{"id": "collision", "name": taxonomy, "slug": "same" if taxonomy in [first, second] else "different"}])
                result, _ = self.taxonomy_build(files, configuration='integrations: [moo({ plugins: [], taxonomies })]')
                self.assertNotEqual(result.returncode, 0)
                output = result.stdout + result.stderr
                for evidence in ["locale en", "/c/same", f"{first}/collision", f"{second}/collision"]:
                    self.assertIn(evidence, output)
        from test_i18n_contract import localized_files, configuration
        files = localized_files()
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('slug: "kategorie"', 'basePath: "/"')
        terms = json.loads(files["src/data/tag.json"])
        terms[0]["locales"] = {"de": {"slug": "Aepfel"}}
        files["src/data/tag.json"] = json.dumps(terms)
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('label: "Tags",', 'label: "Tags", locales: { de: { basePath: "/" } },')
        result, _ = self.build(None, files=files, config_imports=CONFIG_IMPORTS, configuration=configuration())
        self.assertNotEqual(result.returncode, 0)
        for evidence in ["locale de", "/de/aepfel", "category/child", "tag/astro"]:
            self.assertIn(evidence, result.stdout + result.stderr)

    def test_root_terms_reject_reserved_and_selected_plugin_namespaces(self):
        for slug, diagnostic in [("404", "reserved"), ("posts", "namespace /posts")]:
            with self.subTest(slug=slug):
                files = taxonomy_files()
                files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('include: "descendants"', 'include: "descendants", basePath: "/"')
                terms = json.loads(files["src/data/category.json"])
                terms[0]["slug"] = slug
                files["src/data/category.json"] = json.dumps(terms)
                result, _ = self.taxonomy_build(files)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("category/root", result.stdout + result.stderr)
                self.assertIn(diagnostic, result.stdout + result.stderr)

    def test_native_archive_companions_have_explicit_owner_diagnostics(self):
        for filename, archive_base, diagnostic in [("parent.astro", "/", "category/root"), ("[slug].astro", "/", "root"), ("c/native.astro", "/c", "namespace /c")]:
            with self.subTest(filename=filename):
                files = taxonomy_files()
                files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('include: "descendants"', f'include: "descendants", basePath: "{archive_base}"')
                files[f"src/pages/{filename}"] = ('---\nexport function getStaticPaths() { return [{ params: { slug: "unrelated" } }]; }\n---\n' if "[" in filename else "") + "<h1>Native</h1>"
                result, _ = self.taxonomy_build(files)
                self.assertNotEqual(result.returncode, 0)
                output = result.stdout + result.stderr
                self.assertIn(diagnostic, output)
                self.assertIn(filename, output)
                self.assertRegex(output, r"[Cc]onflict")
        files = taxonomy_files()
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('include: "descendants"', 'include: "descendants", basePath: "/"')
        files["src/pages/native.astro"] = "<h1>Unclaimed native page</h1>"
        valid, _ = self.taxonomy_build(files)
        self.assertEqual(valid.returncode, 0, valid.stdout + valid.stderr)
        self.assertIn("native/index.html", valid.generated_html)

    def test_single_language_host_cannot_omit_taxonomy_or_page_output(self):
        for missing in ["taxonomy", "page"]:
            with self.subTest(missing=missing):
                files = taxonomy_files()
                if missing == "taxonomy":
                    files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('include: "descendants"', 'include: "descendants", basePath: "/c"').replace('archive: {}', 'archive: { basePath: "/c" }')
                    files["src/pages/c/[slug].astro"] = "---\nexport function getStaticPaths() { return []; }\n---\n<h1>Missing archive</h1>"
                    config = 'integrations: [moo({ plugins: [page({ taxonomies: bindings }), post({ taxonomies: bindings })], taxonomies, taxonomyRoutes: { archive: "host" } })]'
                    evidence = ["category/child", "locale en", "no emitted route at /c/child"]
                else:
                    files["src/pages/[...slug].astro"] = "---\nexport function getStaticPaths() { return []; }\n---\n<h1>Missing Page</h1>"
                    config = 'integrations: [moo({ plugins: [page({ routes: { single: "host" }, taxonomies: bindings }), post({ taxonomies: bindings })], taxonomies })]'
                    evidence = ["page/contact.md", "locale en", "no emitted route at /contact"]
                result, _ = self.taxonomy_build(files, configuration=config)
                self.assertNotEqual(result.returncode, 0)
                for value in evidence:
                    self.assertIn(value, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
