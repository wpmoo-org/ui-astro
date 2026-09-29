"""Compiled semantic ownership checks for the local shared-part previews."""

from html.parser import HTMLParser
from pathlib import Path
import unittest


DIST = Path(__file__).resolve().parents[1] / "dist"


class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = []

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


def page(path):
    markup = Markup()
    markup.feed((DIST / path).read_text(encoding="utf-8"))
    return markup.elements


def with_attribute(elements, key, value):
    return [(tag, attrs) for tag, attrs in elements if attrs.get(key) == value]


class SharedPartStructure(unittest.TestCase):
    def test_sidebar_include_preserves_published_brand_and_menu_fallbacks(self):
        elements = page("preview/single/index.html")
        self.assertEqual(len(with_attribute(elements, "data-slot", "sidebar-header")), 1)
        self.assertEqual(len(with_attribute(elements, "data-slot", "sidebar-content")), 1)
        self.assertEqual(len(with_attribute(elements, "data-slot", "sidebar-group")), 1)
        self.assertEqual(len(with_attribute(elements, "data-slot", "sidebar-inner")), 1)

    def test_single_and_archive_keep_one_moo_owner_and_heading_hierarchy(self):
        single = page("preview/single/index.html")
        archive = page("preview/archive/index.html")
        for elements in (single, archive):
            self.assertEqual(len(with_attribute(elements, "data-moo-document-owner", "true")), 1)
            self.assertEqual(len([tag for tag, _ in elements if tag == "main"]), 1)
            self.assertEqual(len([tag for tag, _ in elements if tag == "h1"]), 1)
        self.assertEqual(len([tag for tag, _ in archive if tag == "h2"]), 2)
        self.assertEqual(len([tag for tag, _ in archive if tag == "aside"]), 0)
        self.assertEqual(len([tag for tag, attrs in single if tag == "article" and "post-duyuru" in attrs.get("class", "").split()]), 1)


if __name__ == "__main__":
    unittest.main()
