"""Native Page routes obey Astro base, trailing slash, and output format together."""

from html.parser import HTMLParser
import os
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/page-base"
ASTRO = ROOT / "node_modules/.bin/astro"


class PageMarkup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.sidebar_count = 0
        self.main_count = 0
        self.document_lang = None

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "html":
            self.document_lang = attrs.get("lang")
        if tag == "a":
            self.links.append((attrs.get("href"), attrs.get("aria-current")))
        if attrs.get("data-slot") == "sidebar":
            self.sidebar_count += 1
        if tag == "main":
            self.main_count += 1


class NativePageBase(unittest.TestCase):
    def build(self, mode):
        environment = os.environ.copy()
        environment["ASTRO_PAGE_BASE_MODE"] = mode
        result = subprocess.run(
            [str(ASTRO), "build"], cwd=FIXTURE, env=environment,
            text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def page(self, path):
        parsed = PageMarkup()
        parsed.feed((FIXTURE / "dist" / path).read_text(encoding="utf-8"))
        self.assertEqual(parsed.document_lang, "tr")
        self.assertEqual(parsed.main_count, 1)
        return parsed

    def test_directory_output_and_always_links_share_the_docs_base(self):
        self.build("directory")
        home = self.page("index.html")
        contact = self.page("iletisim/index.html")
        guide = self.page("kilavuz/kurulum/index.html")
        self.assertIn(("/docs/", "page"), home.links)
        self.assertIn(("/docs/iletisim/", None), home.links)
        self.assertIn(("/docs/kilavuz/kurulum/", "page"), guide.links)
        self.assertGreaterEqual(contact.links.count(("/docs/", None)), 2)
        self.assertEqual([home.sidebar_count, contact.sidebar_count, guide.sidebar_count], [1, 0, 1])

    def test_file_output_and_never_links_share_the_docs_base(self):
        self.build("file")
        home = self.page("index.html")
        contact = self.page("iletisim.html")
        guide = self.page("kilavuz/kurulum.html")
        self.assertIn(("/docs", "page"), home.links)
        self.assertIn(("/docs/iletisim", None), home.links)
        self.assertIn(("/docs/kilavuz/kurulum", "page"), guide.links)
        self.assertGreaterEqual(contact.links.count(("/docs", None)), 2)
        self.assertEqual([home.sidebar_count, contact.sidebar_count, guide.sidebar_count], [1, 0, 1])

    def test_ignore_links_keep_one_canonical_spelling_with_directory_output(self):
        self.build("ignore")
        home = self.page("index.html")
        contact = self.page("iletisim/index.html")
        guide = self.page("kilavuz/kurulum/index.html")
        self.assertIn(("/docs/", "page"), home.links)
        self.assertIn(("/docs/iletisim", None), home.links)
        self.assertIn(("/docs/kilavuz/kurulum", "page"), guide.links)
        self.assertEqual([home.sidebar_count, contact.sidebar_count, guide.sidebar_count], [1, 0, 1])


if __name__ == "__main__":
    unittest.main()
