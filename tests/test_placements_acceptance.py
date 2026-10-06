"""Compiled placement foundations accepted by the maintainer on 2026-10-06.

Read the sealed starter build. Native browser evidence covers geometry and
interaction; these positive contracts preserve document ownership, matching
width utilities, navigation groups and the responsive TOC disclosure.
"""

from html.parser import HTMLParser
from pathlib import Path
import sys
import unittest


DIST = Path(sys.argv.pop(1)).resolve() if len(sys.argv) > 1 else None
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}


class Element:
    def __init__(self, tag, attrs=()):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []
        self.text = ""

    def find(self, tag):
        return [node for child in self.children
                for node in ([child] if child.tag == tag else []) + child.find(tag)]

    def classes(self):
        return set(self.attrs.get("class", "").split())


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Element("document")
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        if self.stack[-1].tag != tag:
            raise AssertionError("unexpected closing element: " + tag)
        self.stack.pop()

    def handle_data(self, data):
        for node in self.stack:
            node.text += data


class AcceptedPlacements(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if DIST is None or not DIST.is_dir():
            raise AssertionError("pass the absolute sealed starter dist directory")
        cls.documents = {
            locale: Document((DIST / route / "index.html").read_text()).root
            for locale, route in [("en", "placement-guide"), ("de", "de/platzierungen")]
        }

    def test_one_document_and_matching_centered_width_contract(self):
        for locale, root in self.documents.items():
            with self.subTest(locale=locale):
                for tag in ("html", "head", "body", "main"):
                    self.assertEqual(len(root.find(tag)), 1)
                main, = root.find("main")
                self.assertEqual(main.attrs["id"], "main-content")
                rail, = [node for node in main.children
                         if "data-page-container" in node.attrs]
                header_rail = root.find("header")[0].children[0]
                self.assertIn("container-xl", header_rail.classes())
                self.assertTrue({"container-xl", "mx-auto"} <= rail.classes())

    def test_drawer_is_a_named_overlay_with_distinct_taxonomy_groups(self):
        names = {"en": ["Categories", "Tags", "Sectors"],
                 "de": ["Kategorien", "Schlagwörter", "Bereiche"]}
        for locale, root in self.documents.items():
            with self.subTest(locale=locale):
                drawer, = [node for node in root.find("div")
                           if "data-site-drawer" in node.attrs]
                self.assertEqual(drawer.attrs["data-site-drawer"], "left")
                self.assertIn("offcanvas", drawer.classes())
                trigger, = [node for node in root.find("button")
                            if node.attrs.get("aria-controls") == drawer.attrs["id"]]
                self.assertEqual(trigger.attrs["data-bs-toggle"], "offcanvas")
                self.assertTrue(trigger.attrs["aria-label"])
                group_names = [node.attrs.get("aria-label") for node in drawer.find("nav")]
                for name in names[locale]:
                    self.assertEqual(group_names.count(name), 1)

    def test_single_aside_has_a_native_disclosure_before_the_content(self):
        labels = {"en": ("Page information", "On this page"),
                  "de": ("Seiteninformationen", "Auf dieser Seite")}
        for locale, root in self.documents.items():
            with self.subTest(locale=locale):
                main, = root.find("main")
                aside, = main.find("aside")
                article, = main.find("article")
                self.assertEqual(aside.attrs["aria-label"], labels[locale][0])
                self.assertIn("col-xl-3", aside.classes())
                self.assertIn("col-xl-9", article.classes())
                row, = [node for node in main.find("div")
                        if aside in node.children and article in node.children]
                self.assertLess(row.children.index(aside), row.children.index(article))
                button, = aside.find("button")
                self.assertEqual(button.attrs["type"], "button")
                self.assertEqual(button.text, labels[locale][0])
                self.assertEqual(button.attrs["data-bs-toggle"], "collapse")
                self.assertIn("d-xl-none", button.classes())
                self.assertEqual(button.attrs["aria-expanded"], "false")
                target = button.attrs["aria-controls"]
                self.assertEqual(button.attrs["data-bs-target"], "#" + target)
                panel, = [node for node in aside.find("div")
                          if node.attrs.get("id") == target]
                self.assertTrue({"collapse", "d-xl-block"} <= panel.classes())
                toc, = panel.find("nav")
                self.assertEqual(toc.attrs["aria-label"], labels[locale][1])
                headings = [node for tag in ("h2", "h3") for node in article.find(tag)]
                heading_ids = {node.attrs.get("id") for node in headings}
                links = toc.find("a")
                self.assertEqual(len(links), 4)
                for link in links:
                    self.assertIn(link.attrs["href"][1:], heading_ids)


if __name__ == "__main__":
    unittest.main(verbosity=2)
