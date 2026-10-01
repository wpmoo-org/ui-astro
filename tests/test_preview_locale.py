"""Rendered host previews use the selected language and host-owned labels."""

from html.parser import HTMLParser
import json
import os
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.environ.get("ASTRO_PREVIEW_DIST", ROOT / "dist"))
LOCALE = os.environ.get("ASTRO_PREVIEW_LOCALE", "en")
EMPTY_TEXT = {
    "en": ("No items yet.", "No pages yet."),
    "de": ("Noch keine Einträge.", "Noch keine Seiten."),
}
SKIP_TEXT = {
    "en": "Skip to main content",
    "de": "Zum Hauptinhalt springen",
}


class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lang = None
        self.text = []

    def handle_starttag(self, tag, attributes):
        if tag == "html":
            self.lang = dict(attributes).get("lang")

    def handle_data(self, data):
        self.text.append(data)


def page(path):
    markup = Markup()
    markup.feed((DIST / path).read_text(encoding="utf-8"))
    return markup


class PreviewLocale(unittest.TestCase):
    def test_page_archive_uses_the_host_language(self):
        self.assertEqual(page("preview/page-archive/index.html").lang, LOCALE)

    def test_empty_labels_follow_the_same_language(self):
        markup = page("preview/i18n-empty/index.html")
        self.assertEqual(markup.lang, LOCALE)
        rendered = " ".join(markup.text)
        for label in EMPTY_TEXT[LOCALE]:
            self.assertIn(label, rendered)

    def test_preview_page_query_uses_the_selected_language(self):
        data = json.loads((DIST / "preview/page-data.json").read_text(encoding="utf-8"))
        self.assertEqual(data["lang"], LOCALE)

    def test_skip_label_follows_the_host_language(self):
        markup = page("preview/i18n-empty/index.html")
        self.assertEqual(markup.lang, LOCALE)
        self.assertIn(SKIP_TEXT[LOCALE], " ".join(markup.text))


if __name__ == "__main__":
    unittest.main()
