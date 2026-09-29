"""Built native Astro content evidence for Page query and source identity."""

import json
from pathlib import Path
import unittest


DIST = Path(__file__).resolve().parents[1] / "dist"


class NativePageCollection(unittest.TestCase):
    def test_native_loader_preserves_identity_and_filters_public_paths(self):
        data = json.loads((DIST / "preview/page-data.json").read_text(encoding="utf-8"))
        self.assertEqual(data["publishedIds"], ["contact.md", "guide/setup.md"])
        self.assertEqual(data["paths"], [
            {"id": "contact.md", "slug": "iletisim"},
            {"id": "guide/setup.md", "slug": "kilavuz/kurulum"},
        ])
        self.assertEqual(data["contactLayout"], {"sidebar": None, "pageWidth": "lg"})
        self.assertEqual(data["contactDate"], "2026-09-28T16:25:03.000Z")


if __name__ == "__main__":
    unittest.main()
