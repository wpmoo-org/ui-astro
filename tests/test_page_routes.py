"""Built Page route availability through Astro's documented route injection."""

from pathlib import Path
import unittest


DIST = Path(__file__).resolve().parents[1] / "dist"


class BuiltPageRoutes(unittest.TestCase):
    def test_published_pages_render_their_native_markdown_at_canonical_paths(self):
        contact = (DIST / "contact/index.html").read_text(encoding="utf-8")
        guide = (DIST / "guide/setup/index.html").read_text(encoding="utf-8")
        self.assertIn("Contact page body.", contact)
        self.assertIn("Setup guide body.", guide)
        self.assertIn("<title>Contact</title>", contact)
        self.assertIn("<title>Setup guide</title>", guide)
        self.assertFalse((DIST / "draft/index.html").exists())

    def test_page_single_keeps_the_common_title_fallback_when_no_named_slot_is_supplied(self):
        for path, title in (("contact/index.html", "Contact"), ("guide/setup/index.html", "Setup guide")):
            html = (DIST / path).read_text(encoding="utf-8")
            self.assertEqual(html.count("<h1"), 1, path)
            self.assertIn(title, html)

    def test_reusable_page_archive_uses_published_entry_links(self):
        html = (DIST / "preview/page-archive/index.html").read_text(encoding="utf-8")
        self.assertIn("<h1", html)
        self.assertIn('href="/contact"', html)
        self.assertIn('href="/guide/setup"', html)
        self.assertNotIn('href="/draft"', html)


if __name__ == "__main__":
    unittest.main()
