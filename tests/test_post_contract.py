"""Native public Post contracts from a real packed package and Markdown source."""

import json
import unittest

import test_view_structure as native


def post_files():
    return {
        "src/content.config.mjs": '''import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { postSchema } from "@wpmoo/astro/plugins/post/content";
export const collections = { post: defineCollection({
  loader: glob({ base: new URL("./content/post/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }),
  schema: postSchema,
}) };
''',
        "src/content/post/first.md": '---\ntitle: First post\nstatus: publish\npublished_at: "2026-09-20T23:30:00-02:00"\n---\nFirst post body.\n',
        "src/content/post/second.md": '---\ntitle: Second post\nstatus: publish\npublished_at: "2026-09-22T12:00:00Z"\noptions:\n  sidebar: {}\n---\nSecond post body.\n',
        "src/content/post/draft.md": '---\ntitle: Draft post\nstatus: draft\n---\nDraft body.\n',
        "src/content/post/pending.md": '---\ntitle: Pending post\nstatus: pending\n---\nPending body.\n',
        "src/content/post/scheduled.md": '---\ntitle: Scheduled post\nstatus: future\npublished_at: "2099-01-01T12:00:00Z"\n---\nScheduled body.\n',
        "src/content/post/elapsed.md": '---\ntitle: Elapsed future post\nstatus: future\npublished_at: "2025-01-01T12:00:00Z"\n---\nElapsed body.\n',
    }


def parse(html):
    result = native.Markup()
    result.feed(html)
    return result.elements


def footer_links(elements):
    footer = next(index for index, (tag, _) in enumerate(elements) if tag == "footer")
    return [attrs["href"] for tag, attrs in elements[footer:] if tag == "a"]


class PostRendering(unittest.TestCase):
    build = native.PublicComponentRendering.build

    @classmethod
    def setUpClass(cls):
        native.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        native.PublicComponentRendering.tearDownClass.__func__(cls)

    def test_post_only_custom_mount_keeps_identity_utc_dates_and_independent_layout_preferences(self):
        configuration = '''base: "/docs", trailingSlash: "always", integrations: [moo({
  plugins: [post({ label: "News", basePath: "/news" })],
  site: { brand: "Example", types: { post: { sidebar: {}, views: { single: { sidebar: null } } } } },
})]'''
        result, _ = self.build(None, configuration=configuration,
                               config_imports='import { post } from "@wpmoo/astro/plugins/post";', files=post_files())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"news/index.html", "news/first/index.html", "news/second/index.html"})
        archive = parse(result.generated_html["news/index.html"])
        first = parse(result.generated_html["news/first/index.html"])
        second = parse(result.generated_html["news/second/index.html"])
        for elements in (archive, first, second):
            self.assertEqual(sum(tag == "main" for tag, _ in elements), 1)
            self.assertEqual(sum(tag == "h1" for tag, _ in elements), 1)
            self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in elements), 1)
            self.assertEqual(footer_links(elements), ["/docs/news/"])
        self.assertEqual(sum(tag == "aside" for tag, _ in archive), 1)
        self.assertEqual(sum(tag == "aside" for tag, _ in first), 0)
        self.assertEqual(sum(tag == "aside" for tag, _ in second), 1)
        self.assertTrue(any("post-first" in attrs.get("class", "").split() for _, attrs in first))
        self.assertTrue(any("post-second" in attrs.get("class", "").split() for _, attrs in second))
        self.assertIn('datetime="2026-09-21T01:30:00.000Z">2026-09-21</time>', result.generated_html["news/first/index.html"])
        self.assertIn("News", result.generated_html["news/index.html"])
        self.assertIn('href="/docs/news/second/"', result.generated_html["news/index.html"])
        self.assertLess(result.generated_html["news/index.html"].index('href="/docs/news/second/"'),
                        result.generated_html["news/index.html"].index('href="/docs/news/first/"'))
        self.assertTrue(any(attrs.get("aria-current") == "page" and attrs.get("href") == "/docs/news/"
                            for _, attrs in second))
        self.assertNotIn("does not exist", result.stdout + result.stderr)

    def test_public_queries_context_and_typed_views_share_language_and_mount_without_private_data(self):
        files = post_files()
        files["src/content/post/first.md"] = '---\ntitle: Fruit\nstatus: publish\nslug: Äpfel\npublished_at: "2026-09-20T12:00:00Z"\n---\nFruit body.\n'
        files["tsconfig.json"] = json.dumps({"extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "**/*"], "exclude": ["dist"]})
        source = '''---
import Layout from "@wpmoo/astro/Layout.astro";
import Loop from "@wpmoo/astro/plugins/post/views/Loop.astro";
import { getPublishedPosts, getPostPaths } from "@wpmoo/astro/plugins/post/queries";
import { getEntryHref, getSiteContext } from "@wpmoo/astro/context";
const entries = await getPublishedPosts();
const paths = await getPostPaths({ basePath: "/news", lang: "de" });
const entry = entries.find(item => item.id === "first.md");
if (!entry) throw new Error("Expected published Post source ID");
const href = getEntryHref("post", entry);
if (href !== "/docs/news/aepfel" || paths.find(item => item.props.entry.id === entry.id)?.params.slug !== "aepfel") {
  throw new Error("Post query and facade must share canonical URLs");
}
const context = getSiteContext();
if (context.plugins[0].contentTypes[0].collection !== "post" || "sources" in context) throw new Error("Invalid public metadata");
---
<Layout title="Embedded Post loop" lang="de"><Loop entries={entries} basePath="/news" base="/docs" lang="de" titleVariant="subsection-title" /></Layout>
'''
        result, html = self.build(source, configuration='base: "/docs", integrations: [moo({ plugins: [post({ label: "News", basePath: "/news" })], site: { defaults: { lang: "de" } } })]',
                                  config_imports='import { post } from "@wpmoo/astro/plugins/post";', files=files, check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("0 errors", result.stdout + result.stderr)
        elements = parse(html)
        self.assertEqual(sum(tag == "h3" for tag, _ in elements), 2)
        self.assertTrue(any(tag == "a" and attrs.get("href") == "/docs/news/aepfel" for tag, attrs in elements))
        self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in elements), 1)

    def test_selected_empty_post_archive_is_valid(self):
        files = {path: value for path, value in post_files().items() if path == "src/content.config.mjs"}
        files["src/content/post/.gitkeep"] = ""
        result, _ = self.build(None, configuration='integrations: [moo({ plugins: [post()] })]',
                               config_imports='import { post } from "@wpmoo/astro/plugins/post";', files=files)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"posts/index.html"})
        self.assertIn("No posts yet.", result.generated_html["posts/index.html"])

    def test_native_post_urls_keep_source_classes_across_language_mount_and_slash_policies(self):
        cases = [
            ("de", "always", [
                ("Straße.md", "Street", None, "strasse", "post-id--Stra_00df_e_002e_md"),
                ("Äpfel.md", "Fruit", None, "aepfel", "post-id--_00c4_pfel_002e_md"),
            ]),
            ("de", "never", [
                ("Straße.md", "Street", None, "strasse", "post-id--Stra_00df_e_002e_md"),
            ]),
            ("tr", "ignore", [
                ("releases/update.md", "Release", "Şirket Çözümleri", "sirket-cozumleri", "post-id--releases_002f_update_002e_md"),
            ]),
        ]
        for lang, trailing, entries in cases:
            with self.subTest(lang=lang, trailing=trailing):
                files = {"src/content.config.mjs": post_files()["src/content.config.mjs"]}
                expected = []
                for source_id, title, raw_slug, slug, _ in entries:
                    frontmatter = f'title: {title}\nstatus: publish\npublished_at: "2026-09-20T12:00:00Z"\n'
                    if raw_slug is not None:
                        frontmatter += "slug: " + json.dumps(raw_slug) + "\n"
                    files[f"src/content/post/{source_id}"] = "---\n" + frontmatter + "---\nEnglish body.\n"
                    href = f"/docs/aktuelles/{slug}" + ("/" if trailing == "always" else "")
                    expected.append([source_id, slug, href])
                source = '''---
import { getPostPaths } from "@wpmoo/astro/plugins/post/queries";
import { getEntryHref } from "@wpmoo/astro/context";
const paths = await getPostPaths({ basePath: "/aktuelles", lang: ''' + json.dumps(lang) + ''' });
const actual = paths.map(path => [path.props.entry.id, path.params.slug, getEntryHref("post", path.props.entry)]);
if (JSON.stringify(actual) !== JSON.stringify(''' + json.dumps(expected) + ''')) throw new Error("Native Post URL projections disagree");
---
<h1>Post URL contract</h1>
'''
                configuration = f'base: "/docs", trailingSlash: "{trailing}", integrations: [moo({{ plugins: [post({{ label: "Aktuelles", basePath: "/aktuelles" }})], site: {{ defaults: {{ lang: "{lang}" }} }} }})]'
                result, _ = self.build(source, configuration=configuration,
                                       config_imports='import { post } from "@wpmoo/astro/plugins/post";', files=files)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                archive = result.generated_html["aktuelles/index.html"]
                self.assertIn("<title>Aktuelles</title>", archive)
                for (_, title, _, slug, identity_class), (_, _, href) in zip(entries, expected):
                    self.assertIn(f'href="{href}"', archive)
                    single = result.generated_html[f"aktuelles/{slug}/index.html"]
                    elements = parse(single)
                    self.assertTrue(any(identity_class in attrs.get("class", "").split() for _, attrs in elements))
                    self.assertTrue(any(tag == "html" and attrs.get("lang") == lang for tag, attrs in elements))
                    self.assertIn(f"<title>{title}</title>", single)
                    self.assertIn("Aktuelles", single)
                owner = next(attrs for _, attrs in parse(archive) if attrs.get("data-moo-document-owner") == "true")
                self.assertTrue({"archive", "post"}.issubset(owner["class"].split()))

    def test_supplied_post_views_preserve_omitted_empty_and_replaced_slots_without_owning_a_shell(self):
        source = '''---
import Single from "@wpmoo/astro/plugins/post/views/Single.astro";
import Archive from "@wpmoo/astro/plugins/post/views/Archive.astro";
import Typography from "@wpmoo/astro/components/Typography.astro";
import { postSchema } from "@wpmoo/astro/plugins/post/content";
const entry = { collection: "post" as const, id: "first.md", data: postSchema.parse({ title: "Post title", status: "publish", published_at: "2026-09-20T23:30:00-02:00" }) };
---
<section id="single-default"><Single entry={entry}><p>Supplied body.</p></Single></section>
<section id="single-empty"><Single entry={entry}><Fragment slot="page-header" /><Fragment slot="metadata" /><p>Supplied body.</p></Single></section>
<section id="single-metadata"><Single entry={entry}><p slot="metadata">Custom metadata</p><p>Supplied body.</p><p slot="after-content">After content</p></Single></section>
<section id="archive-default"><Archive entries={[entry]} /></section>
<section id="archive-empty"><Archive entries={[entry]}><Fragment slot="loop" /><Fragment slot="page-header" /></Archive></section>
<section id="archive-replaced"><Archive entries={[entry]}><Typography slot="page-header" variant="page-title" content="Custom archive" /><Typography slot="loop" variant="subsection-title" content="Custom loop" /><p slot="after-list">After list</p></Archive></section>
'''
        result, html = self.build(source, files=post_files())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        cases = native.SlotCases()
        cases.feed(html)
        def count(name, tag):
            return sum(actual == tag for actual, _ in cases.cases[name]["elements"])
        self.assertEqual(count("single-default", "h1"), 1)
        self.assertEqual(count("single-default", "time"), 1)
        self.assertEqual(count("single-empty", "h1"), 0)
        self.assertEqual(count("single-empty", "time"), 0)
        self.assertEqual(count("single-metadata", "time"), 0)
        self.assertIn("Custom metadata", "".join(cases.cases["single-metadata"]["text"]))
        self.assertIn("After content", "".join(cases.cases["single-metadata"]["text"]))
        self.assertEqual(count("archive-default", "h1"), 1)
        self.assertEqual(count("archive-default", "h2"), 1)
        self.assertEqual(count("archive-empty", "h1"), 0)
        self.assertEqual(count("archive-empty", "li"), 0)
        self.assertEqual(count("archive-replaced", "h1"), 1)
        self.assertEqual(count("archive-replaced", "h3"), 1)
        self.assertIn("After list", "".join(cases.cases["archive-replaced"]["text"]))
        for case in cases.cases.values():
            self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in case["elements"]), 0)
            self.assertEqual(sum(tag == "main" for tag, _ in case["elements"]), 0)

    def test_omitted_selection_builds_the_default_pair_and_keeps_the_published_page_home(self):
        files = post_files()
        files["src/content.config.mjs"] = files["src/content.config.mjs"].replace(
            'export const collections = { post:',
            'import { pageSchema } from "@wpmoo/astro/plugins/page/content";\n'
            'export const collections = { page: defineCollection({ loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: pageSchema }), post:',
        )
        files["src/content/page/index.md"] = "---\ntitle: Home\nstatus: publish\nnavOrder: 99\n---\nHome body.\n"
        files["src/content/page/contact.md"] = "---\ntitle: Contact\nstatus: publish\nnavOrder: 1\n---\nContact body.\n"
        result, _ = self.build(None, configuration='integrations: [moo()]', files=files)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"index.html", "contact/index.html", "posts/index.html", "posts/first/index.html", "posts/second/index.html"})
        for output in ("posts/index.html", "posts/first/index.html", "posts/second/index.html"):
            self.assertEqual(footer_links(parse(result.generated_html[output])), ["/"])

    def test_a_selected_post_namespace_blocks_page_claims_and_disabled_post_reserves_nothing(self):
        files = self.page_files()
        files["src/content/page/posts/first.md"] = "---\ntitle: Ordinary Page\nstatus: publish\n---\nPage body.\n"
        result, _ = self.build(None, configuration='integrations: [moo({ plugins: [page()] })]', files=files)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("posts/first/index.html", result.generated_html)
        selected = post_files()
        selected["src/content.config.mjs"] = selected["src/content.config.mjs"].replace(
            'export const collections = { post:',
            'import { pageSchema } from "@wpmoo/astro/plugins/page/content";\n'
            'export const collections = { page: defineCollection({ loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: pageSchema }), post:',
        )
        selected["src/content/page/news/claim.md"] = "---\ntitle: Collision\nstatus: publish\n---\nCollision body.\n"
        result, _ = self.build(None, configuration='integrations: [moo({ plugins: [page(), post({ basePath: "/news" })] })]',
                               config_imports='import { post } from "@wpmoo/astro/plugins/post";', files=selected)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("news/claim.md", result.stdout + result.stderr)
        self.assertIn("reserved namespace /news", result.stdout + result.stderr)

    def page_files(self):
        return native.PublicComponentRendering.integrated_files(self)

    def test_actual_source_schema_rejects_missing_and_ambiguous_post_publication_dates(self):
        for value, diagnostic in [(None, "published_at"), ("2026-02-30T12:00:00Z", "valid ISO"),
                                  ("2026-09-20T12:00:00", "valid ISO"), ("2026-09-20", "timezone-qualified"),
                                  ("2999-01-01T12:00:00Z", "future published_at")]:
            with self.subTest(value=value):
                files = post_files()
                date = "" if value is None else "published_at: " + json.dumps(value) + "\n"
                files["src/content/post/first.md"] = "---\ntitle: First post\nstatus: publish\n" + date + "---\nBody.\n"
                result, _ = self.build(None, configuration='integrations: [moo({ plugins: [post()] })]',
                                       config_imports='import { post } from "@wpmoo/astro/plugins/post";', files=files)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("post", result.stdout + result.stderr)
                self.assertIn(diagnostic, result.stdout + result.stderr)

    def test_exact_host_route_ownership_requires_real_native_archive_and_single_companions(self):
        files = post_files()
        host_single = '''---
import { getPostPaths } from "@wpmoo/astro/plugins/post/queries";
export async function getStaticPaths() { return getPostPaths(); }
const { entry } = Astro.props;
---
<h1>{entry.data.title}</h1>
'''
        for owners, supplied, valid, pattern in [
            ({}, {"src/pages/posts/index.astro": "<h1>Host archive</h1>"}, False, "/posts"),
            ({}, {"src/pages/posts/[...slug].astro": host_single}, False, "/posts/[...slug]"),
            ({"single": "host"}, {}, False, "/posts/[...slug]"),
            ({"archive": "host"}, {}, False, "/posts"),
            ({"single": "host"}, {"src/pages/posts/[...slug].astro": host_single}, True, "/posts/[...slug]"),
            ({"archive": "host", "single": "host"}, {"src/pages/posts/[...slug].astro": host_single,
                                                       "src/pages/posts/index.astro": "<h1>Host archive</h1>"}, True, "/posts"),
        ]:
            with self.subTest(owners=owners, supplied=list(supplied)):
                result, _ = self.build(None, configuration='integrations: [moo({ plugins: [post({ routes: '
                                       + json.dumps(owners) + ' })] })]',
                                       config_imports='import { post } from "@wpmoo/astro/plugins/post";', files={**files, **supplied})
                if valid:
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertEqual(set(result.generated_html), {"posts/index.html", "posts/first/index.html", "posts/second/index.html"})
                else:
                    self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertIn(pattern, result.stdout + result.stderr)
                    self.assertIn("post", result.stdout + result.stderr)

    def test_no_output_cannot_skip_post_source_identity_and_future_url_claim_collisions(self):
        files = post_files()
        files["src/content/post/First.md"] = '---\ntitle: Same URL\nstatus: future\npublished_at: "2099-01-01T12:00:00Z"\n---\nFuture body.\n'
        files["src/pages/posts/index.astro"] = "<h1>Host archive</h1>"
        files["src/pages/posts/[...slug].astro"] = '---\nexport function getStaticPaths() { return []; }\n---\n<h1>Unused</h1>'
        result, _ = self.build(None, configuration='integrations: [moo({ plugins: [post({ routes: { archive: "host", single: "host" } })] })]',
                               config_imports='import { post } from "@wpmoo/astro/plugins/post";', files=files)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertRegex(result.stdout + result.stderr, r"First\.md.*first\.md|first\.md.*First\.md")
        self.assertIn("/posts/first", result.stdout + result.stderr)
