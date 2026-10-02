"""Real mixed MD/MDX compilation through the public packed Moo Astro API."""

from pathlib import Path
import json
import unittest

import test_view_structure as native


FIXTURE = Path(__file__).parent / "fixtures/mdx"


def mdx_files():
    return {str(path.relative_to(FIXTURE)): path.read_text(encoding="utf-8")
            for path in FIXTURE.rglob("*") if path.is_file()
            and path.name not in {"package.json", "package-lock.json"}}


class MixedContentConsumer(unittest.TestCase):
    build = native.PublicComponentRendering.build

    @classmethod
    def setUpClass(cls):
        native.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        native.PublicComponentRendering.tearDownClass.__func__(cls)

    def test_mixed_md_mdx_share_page_post_contracts(self):
        result, _ = self.build(None, files=mdx_files(), check=True, extra_modules=("@astrojs/mdx",))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        expected = {"about/index.html", "enhanced/index.html", "landing/index.html",
                    "posts/index.html", "posts/article/index.html", "posts/enhanced-article/index.html"}
        self.assertEqual(set(result.generated_html), expected)
        for path, html in result.generated_html.items():
            with self.subTest(path=path):
                markup = native.Markup()
                markup.feed(html)
                self.assertEqual(sum(tag == "h1" for tag, _ in markup.elements), 1)
                self.assertEqual(sum(tag == "main" for tag, _ in markup.elements), 1)
                self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in markup.elements), 1)
        self.assertIn("Markdown Page body.", result.generated_html["about/index.html"])
        self.assertIn("Reusable MDX Hero", result.generated_html["enhanced/index.html"])
        self.assertIn("Reusable Astro Hero", result.generated_html["landing/index.html"])
        self.assertIn('role="button" href="/landing"', result.generated_html["enhanced/index.html"])
        self.assertIn('datetime="2026-09-28T01:30:00.000Z"', result.generated_html["posts/enhanced-article/index.html"])
        self.assertIn("category-guides", result.generated_html["enhanced/index.html"])
        self.assertIn("tag-astro", result.generated_html["posts/enhanced-article/index.html"])
        self.assertIn('href="/posts/enhanced-article"', result.generated_html["posts/index.html"])
        self.assertIn("0 errors", result.stdout + result.stderr)
        records = json.loads(result.generated_data["metadata.json"])
        self.assertEqual([entry["id"] for entry in records["page"]], ["about.md", "about.mdx"])
        self.assertEqual([entry["id"] for entry in records["post"]], ["article.md", "article.mdx"])
        mdx_page = records["page"][1]
        self.assertEqual(mdx_page["data"]["options"], {
            "sidebar": {}, "parts": {"content": {"utilities": ["py-3"]}}})
        self.assertEqual(mdx_page["data"]["taxonomies"]["category"], [{"collection": "category", "id": "guides"}])
        self.assertEqual(records["post"][1]["data"]["options"], {"sidebar": None})
        self.assertEqual(records["post"][1]["data"]["published_at"], "2026-09-28T01:30:00.000Z")
        for record in records["page"] + records["post"]:
            self.assertTrue(record["href"].startswith("/"))
            markup = native.Markup()
            markup.feed(result.generated_html[record["href"].strip("/") + "/index.html"])
            classes = {token for _, attrs in markup.elements for token in attrs.get("class", "").split()}
            self.assertTrue(set(record["classNames"]).issubset(classes))

    def test_legacy_markdown_layout_reports_the_options_migration(self):
        cases = {
            "src/content/page/about.md": "---\ntitle: Legacy\nstatus: publish\nlayout:\n  sidebar: null\n---\nLegacy body.\n",
            "src/content/post/article.md": "---\ntitle: Legacy\nstatus: draft\nlayout: ./Layout.astro\n---\nLegacy body.\n",
        }
        for path, content in cases.items():
            with self.subTest(path=path):
                files = mdx_files()
                files[path] = content
                result, _ = self.build(None, files=files, extra_modules=("@astrojs/mdx",))
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn('"layout"', result.stdout + result.stderr)
                self.assertIn('"options"', result.stdout + result.stderr)

    def test_md_mdx_canonical_collision_names_both_distinct_source_ids(self):
        files = mdx_files()
        files["src/content/page/about.mdx"] = files["src/content/page/about.mdx"].replace("slug: enhanced\n", "")
        result, _ = self.build(None, files=files, extra_modules=("@astrojs/mdx",))
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Page URL collision", result.stdout + result.stderr)
        for text in ["about.md", "about.mdx", "/about"]:
            self.assertIn(text, result.stdout + result.stderr)

    def test_distinct_source_ids_survive_body_equality_order_and_warm_cache(self):
        for identical in (False, True):
            for reverse in (False, True):
                with self.subTest(identical=identical, reverse=reverse):
                    files = mdx_files()
                    for path, body in [
                        ("src/content/page/about.md", "Shared body." if identical else "Markdown source body."),
                        ("src/content/page/about.mdx", "Shared body." if identical else "MDX source body."),
                    ]:
                        frontmatter = files[path].split("---", 2)[1]
                        files[path] = f"---{frontmatter}---\n{body}\n"
                    if reverse:
                        files = dict(reversed(list(files.items())))
                    result, _ = self.build(None, files=files, extra_modules=("@astrojs/mdx",), warm=True)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertEqual(result.generated_html, result.cold_generated_html)
                    self.assertEqual(result.generated_data, result.cold_generated_data)
                    records = json.loads(result.generated_data["metadata.json"])["page"]
                    self.assertEqual([entry["id"] for entry in records], ["about.md", "about.mdx"])
                    self.assertEqual([entry["href"] for entry in records], ["/about", "/enhanced"])
                    self.assertNotEqual(records[0]["classNames"], records[1]["classNames"])
                    for path, body in [("about/index.html", "Shared body." if identical else "Markdown source body."),
                                       ("enhanced/index.html", "Shared body." if identical else "MDX source body.")]:
                        self.assertIn(body, result.generated_html[path])

    def test_explicit_slug_collision_has_its_own_source_diagnostic(self):
        files = mdx_files()
        files["src/content/page/about.md"] = files["src/content/page/about.md"].replace("status: publish\n", "status: publish\nslug: enhanced\n")
        result, _ = self.build(None, files=files, extra_modules=("@astrojs/mdx",))
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        for text in ["Page URL collision", "about.md", "about.mdx", "/enhanced"]:
            self.assertIn(text, result.stdout + result.stderr)

    def test_native_landing_and_content_cannot_own_the_same_output(self):
        files = mdx_files()
        files["src/content/page/about.mdx"] = files["src/content/page/about.mdx"].replace("slug: enhanced\n", "slug: landing\n")
        result, _ = self.build(None, files=files, extra_modules=("@astrojs/mdx",))
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("PrerenderRouteConflict", result.stdout + result.stderr)
        self.assertIn("/landing", result.stdout + result.stderr)

    def test_missing_official_mdx_integration_fails_required_source_preservation(self):
        files = mdx_files()
        self.assertEqual(files["astro.config.mjs"].count("mdx(),"), 1)
        files["astro.config.mjs"] = files["astro.config.mjs"].replace("mdx(),", "", 1)
        result, _ = self.build(None, files=files, extra_modules=("@astrojs/mdx",))
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("page source about.mdx is missing from the native collection", result.stdout + result.stderr)
        self.assertNotIn("enhanced/index.html", result.generated_html)


if __name__ == "__main__":
    unittest.main()
