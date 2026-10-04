"""Built native Astro content evidence for Page query and source identity."""

import json
from pathlib import Path
import unittest


DIST = Path(__file__).resolve().parents[1] / "apps/demo/dist"


class NativePageCollection(unittest.TestCase):
    def test_native_loader_preserves_identity_and_filters_public_paths(self):
        data = json.loads((DIST / "preview/page-data.json").read_text(encoding="utf-8"))
        self.assertEqual(data["publishedIds"], ["en/contact.md", "en/guide/setup.md", "en/enhanced-page.mdx", "en/editable.md"])
        self.assertEqual(data["paths"], [
            {"id": "en/contact.md", "slug": "contact"},
            {"id": "en/guide/setup.md", "slug": "guide/setup"},
            {"id": "en/enhanced-page.mdx", "slug": "enhanced-page"},
            {"id": "en/editable.md", "slug": "editable"},
        ])
        self.assertEqual(data["contactOptions"], {
            "sidebar": None, "pageWidth": "lg", "parts": {"content": {"utilities": ["py-2"]}},
        })
        self.assertEqual(data["contactDate"], "2026-09-28T16:25:03.000Z")
        self.assertEqual(data["filePaths"], [
            "content/page/en/contact.md",
            "content/page/en/guide/setup.md",
            "content/page/en/enhanced-page.mdx",
            "content/page/en/editable.md",
        ])

    def test_public_site_context_exposes_preferences_without_host_source_paths(self):
        source = (DIST / "preview/site-context.json").read_text(encoding="utf-8")
        data = json.loads(source)
        self.assertEqual(data["site"]["defaults"]["lang"], "en")
        self.assertEqual(data["base"], "/")
        self.assertEqual(data["plugins"][0]["contentTypes"][0]["collection"], "page")
        self.assertEqual(data["contactHref"], "/contact")
        self.assertEqual(data["navigation"], [
            {"label": "Contact · no Sidebar", "href": "/contact", "active": True},
            {"label": "Setup guide", "href": "/guide/setup", "active": False},
            {"label": "Enhanced Page", "href": "/enhanced-page", "active": False},
            {"label": "Page with sections", "href": "/editable", "active": False},
            {"label": "Posts", "href": "/posts", "active": False},
        ])
        self.assertNotIn("file:", source)
        self.assertNotIn("src/content/page", source)
        self.assertNotIn("demo/content/page", source)


if __name__ == "__main__":
    unittest.main()
