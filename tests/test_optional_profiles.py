"""Native compilation of UI-only, Page-only and Post-only public consumers."""

from pathlib import Path
import unittest

import test_view_structure as native


FIXTURES = Path(__file__).parent / "fixtures"


def profile_files(profile):
    root = FIXTURES / profile
    return {str(path.relative_to(root)): path.read_text(encoding="utf-8")
            for path in root.rglob("*") if path.is_file()
            and path.name not in {"package.json", "package-lock.json"}}


class OptionalConsumers(unittest.TestCase):
    build = native.PublicComponentRendering.build

    @classmethod
    def setUpClass(cls):
        native.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        native.PublicComponentRendering.tearDownClass.__func__(cls)

    def test_ui_only_builds_public_wrappers_and_props_only_views_without_content(self):
        result, html = self.build(None, files=profile_files("ui-only"), check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"index.html"})
        self.assertIn('data-public-wrapper-count="45"', html)
        self.assertIn("Props-only Archive", html)
        self.assertIn("Supplied item", html)
        self.assertIn('href="#supplied-item"', html)
        markup = native.Markup()
        markup.feed(html)
        self.assertEqual(sum(tag == "h1" for tag, _ in markup.elements), 1)
        self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in markup.elements), 1)

    def test_page_only_requires_only_the_selected_page_collection(self):
        result, _ = self.build(None, files=profile_files("page-only"), check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"contact/index.html"})
        html = result.generated_html["contact/index.html"]
        self.assertIn("Page-only body.", html)
        self.assertIn('href="/docs/contact/"', html)

    def test_post_only_requires_only_posts_and_keeps_its_custom_mount(self):
        result, _ = self.build(None, files=profile_files("post-only"), check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"news/index.html", "news/article/index.html"})
        self.assertIn('href="/docs/news/article/"', result.generated_html["news/index.html"])
        self.assertIn("Post-only body.", result.generated_html["news/article/index.html"])

    def test_selected_empty_collection_is_valid(self):
        for profile, collection, expected in (
            ("page-only", "page", set()),
            ("post-only", "post", {"news/index.html"}),
        ):
            with self.subTest(profile=profile):
                files = {path: content for path, content in profile_files(profile).items()
                         if not path.endswith(".md")}
                files[f"src/content/{collection}/.gitkeep"] = ""
                result, _ = self.build(None, files=files, check=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(set(result.generated_html), expected)

    def test_missing_selected_collection_has_its_own_diagnostic(self):
        for profile, collection in (("page-only", "page"), ("post-only", "post")):
            with self.subTest(profile=profile):
                files = profile_files(profile)
                files["src/content.config.ts"] = "export const collections = {};\n"
                result, _ = self.build(None, files=files)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"{collection} collection is not declared in the host content config",
                              result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
