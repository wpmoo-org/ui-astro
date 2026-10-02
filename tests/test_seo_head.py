"""Actual packed HTML head contracts; these tests do not establish visual geometry."""
from html.parser import HTMLParser
import json
import unittest

import test_view_structure as rendering


class Head(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.elements = []
        self.titles = []
        self.schemas = []
        self.headings = []
        self.target = None
        self.buffer = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.elements.append((tag, attrs))
        if tag in {"title", "h1"} or (tag == "script" and attrs.get("type") == "application/ld+json"):
            self.target = tag
            self.buffer = []

    def handle_data(self, data):
        if self.target:
            self.buffer.append(data)

    def handle_endtag(self, tag):
        if tag != self.target:
            return
        value = "".join(self.buffer)
        if tag == "title":
            self.titles.append(value)
        elif tag == "h1":
            self.headings.append(value)
        else:
            self.schemas.append(json.loads(value))
        self.target = None

    def metas(self, key):
        return [attrs["content"] for tag, attrs in self.elements
                if tag == "meta" and (attrs.get("name") == key or attrs.get("property") == key)]

    def canonicals(self):
        return [attrs["href"] for tag, attrs in self.elements
                if tag == "link" and attrs.get("rel") == "canonical"]


class SeoRendering(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rendering.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        rendering.PublicComponentRendering.tearDownClass.__func__(cls)

    build = rendering.PublicComponentRendering.build

    def test_layout_emits_one_escaped_head_and_script_safe_truthful_post_data(self):
        title = '</script><script id="injected">alert(1)</script> & {organization.name}'
        source = '''---
import Layout from "@wpmoo/astro/Layout.astro";
import Typography from "@wpmoo/astro/components/Typography.astro";
import { defineSite } from "@wpmoo/astro/config";
import { resolveSeoMetadata } from "@wpmoo/astro/seo";
const title = TITLE;
const metadata = resolveSeoMetadata(defineSite({ brand: "Visible label", organization: { name: "Publisher & Company" } }), {
  title, description: '<img src=x onerror="alert(2)">', type: "post", view: "single", status: "publish",
  url: new URL(Astro.url.pathname, Astro.site).href,
  published_at: "2026-09-28T10:00:00Z", updated_at: "2026-09-29T10:00:00Z",
});
---
<Layout title={title} metadata={metadata}><Typography variant="page-title" content={title} /></Layout>
'''.replace("TITLE", json.dumps(title))
        result, html = self.build(source, configuration='site: "https://example.test", base: "/docs", trailingSlash: "always",',
                                  files={"tsconfig.json": '{"extends":"astro/tsconfigs/strict","include":["**/*",".astro/types.d.ts"]}'}, check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        parsed = Head(html)
        self.assertEqual(parsed.titles, [title + " | Publisher & Company"])
        self.assertEqual(parsed.headings, [title])
        self.assertEqual(parsed.canonicals(), ["https://example.test/docs/"])
        self.assertEqual(parsed.metas("description"), ['<img src=x onerror="alert(2)">'])
        self.assertEqual(parsed.metas("og:title"), parsed.titles)
        self.assertEqual(parsed.metas("og:url"), parsed.canonicals())
        self.assertEqual(parsed.metas("og:type"), ["article"])
        self.assertEqual(parsed.metas("twitter:card"), ["summary"])
        self.assertEqual(len(parsed.schemas), 1)
        schema = parsed.schemas[0]
        self.assertEqual(schema["headline"], title)
        self.assertEqual(schema["url"], parsed.canonicals()[0])
        self.assertEqual(schema["datePublished"], "2026-09-28T10:00:00.000Z")
        self.assertEqual(schema["dateModified"], "2026-09-29T10:00:00.000Z")
        self.assertEqual(schema["publisher"], {"@type": "Organization", "name": "Publisher & Company"})
        self.assertNotIn("author", schema)
        self.assertNotIn("image", schema)
        self.assertFalse(any(attrs.get("id") == "injected" or "onerror" in attrs for _, attrs in parsed.elements))
        self.assertEqual(sum(tag == "h1" for tag, _ in parsed.elements), 1)
        self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in parsed.elements), 1)
        self.assertIn("\\u003c/script\\u003e", html)

    def test_bare_layout_remains_valid_without_a_site_or_fabricated_metadata(self):
        result, html = self.build('''---
import Layout from "@wpmoo/astro/Layout.astro";
---
<Layout title="Ordinary title"><h1>Ordinary heading</h1></Layout>
''')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        parsed = Head(html)
        self.assertEqual(parsed.titles, ["Ordinary title"])
        self.assertEqual(parsed.schemas, [])
        self.assertEqual(parsed.canonicals(), [])
        self.assertEqual(parsed.metas("description"), [])

    def test_layout_keeps_ordinary_description_when_metadata_omits_it(self):
        result, html = self.build('''---
import Layout from "@wpmoo/astro/Layout.astro";
import { defineSite } from "@wpmoo/astro/config";
import { resolveSeoMetadata } from "@wpmoo/astro/seo";
const metadata = resolveSeoMetadata(defineSite(), {
  title: "Resolved title", status: "publish", view: "native", url: "https://example.test/",
});
---
<Layout title="Ordinary title" description="Authored summary" metadata={metadata}><h1>Ordinary heading</h1></Layout>
''')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        parsed = Head(html)
        self.assertEqual(parsed.titles, ["Resolved title"])
        self.assertEqual(parsed.metas("description"), ["Authored summary"])
        self.assertNotIn("description", parsed.schemas[0])

    def test_injected_page_post_and_host_cpt_head_urls_match_actual_emitted_files(self):
        content = '''import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
import { postSchema } from "@wpmoo/astro/plugins/post/content";
export const collections = {
  page: defineCollection({ loader: glob({ base: "./src/content/page", pattern: "**/*.md", generateId: sourceEntryId }), schema: pageSchema }),
  post: defineCollection({ loader: glob({ base: "./src/content/post", pattern: "**/*.md", generateId: sourceEntryId }), schema: postSchema }),
};'''
        files = {
            "src/content.config.mjs": content,
            "src/content/page/contact.md": "---\ntitle: Contact\nstatus: publish\n---\nContact body.\n",
            "src/content/post/announcement.md": '---\ntitle: Announcement\ndescription: A real summary.\nstatus: publish\npublished_at: "2026-09-28T10:00:00Z"\n---\nArticle body.\n',
            "src/content/post/draft.md": "---\ntitle: Draft\nstatus: draft\n---\nDraft body.\n",
            "src/content/post/pending.md": "---\ntitle: Pending\nstatus: pending\n---\nPending body.\n",
            "src/content/post/future.md": '---\ntitle: Scheduled\nstatus: future\npublished_at: "2099-10-01T10:00:00Z"\n---\nScheduled body.\n',
            "src/pages/team/alex.astro": '''---
import Layout from "@wpmoo/astro/Layout.astro";
import Single from "@wpmoo/astro/views/Single.astro";
import { defineSite } from "@wpmoo/astro/config";
import { resolveSeoMetadata } from "@wpmoo/astro/seo";
const site = defineSite({ organization: { name: "Example Foundation" } });
const metadata = resolveSeoMetadata(site, { title: "Alex", type: "team", view: "single", status: "publish", url: new URL(Astro.url.pathname, Astro.site).href });
---
<Layout title="Alex" metadata={metadata}><Single title="Alex"><p>Team profile.</p></Single></Layout>
''',
        }
        for base in ["/", "/docs"]:
            for mode in ["always", "never", "ignore"]:
                with self.subTest(base=base, trailingSlash=mode):
                    result, _ = self.build(None, files=files,
                        config_imports='import { post } from "@wpmoo/astro/plugins/post";\n',
                        configuration=f'site: "https://example.test", base: {json.dumps(base)}, trailingSlash: {json.dumps(mode)}, integrations: [moo({{ site: {{ organization: {{ name: "Example Foundation" }} }}, plugins: [page(), post()] }})],')
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    expected = {"contact/index.html": ("Contact | Example Foundation", "WebPage"),
                                "posts/index.html": ("Posts | Example Foundation", "WebPage"),
                                "posts/announcement/index.html": ("Announcement | Example Foundation", "BlogPosting"),
                                "team/alex/index.html": ("Alex | Example Foundation", "WebPage")}
                    self.assertEqual(set(result.generated_html), set(expected))
                    for file, (title, kind) in expected.items():
                        parsed = Head(result.generated_html[file])
                        path = file.removesuffix("/index.html")
                        mount = base.rstrip("/")
                        # Existing Moo collection routes choose a slash under always only; native directory routes keep one under ignore.
                        slash = "/" if mode == "always" or (mode == "ignore" and path == "team/alex") else ""
                        canonical = f"https://example.test{mount}/{path}{slash}"
                        self.assertEqual(parsed.titles, [title])
                        self.assertEqual(parsed.canonicals(), [canonical])
                        self.assertEqual(len(parsed.schemas), 1)
                        self.assertEqual(parsed.schemas[0]["@type"], kind)
                        self.assertEqual(parsed.schemas[0]["url"], canonical)
                        if kind == "BlogPosting":
                            self.assertEqual(parsed.schemas[0]["datePublished"], "2026-09-28T10:00:00.000Z")
                            self.assertNotIn("dateModified", parsed.schemas[0])
