"""Positive markup contracts for the language switcher accepted on 2026-10-05.

Read a packed UI-only build. Browser evidence covers geometry, focus and
navigation; this reader protects its accepted semantic and utility contracts.
"""

from html.parser import HTMLParser
from pathlib import Path
import sys
import unittest


DIST = Path(sys.argv.pop(1)).resolve() if len(sys.argv) > 1 else None
STATES = ("light-ltr", "dark-ltr", "light-rtl", "dark-rtl")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}


class Element:
    def __init__(self, tag, attrs=()):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []
        self.text = ""

    def find(self, tag):
        result = []
        for child in self.children:
            if child.tag == tag:
                result.append(child)
            result.extend(child.find(tag))
        return result

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


class AcceptedLanguageSwitcher(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if DIST is None or not DIST.is_dir():
            raise AssertionError("pass the absolute packed UI-only dist directory")
        cls.documents = {}
        for state in STATES:
            html = (DIST / "language-switcher" / state / "index.html").read_text()
            root = Document(html).root
            sections = {node.attrs["id"]: node for node in root.find("section")}
            cls.documents[state] = (root, sections, html)

    def test_document_and_trigger_keep_accessible_names_and_centering_utilities(self):
        modes = {"responsive": {"d-none", "d-md-inline"}, "visible": set(),
                 "hidden": {"d-none"}, "unknown-current": {"d-none", "d-md-inline"}}
        for state, (root, sections, _) in self.documents.items():
            with self.subTest(state=state):
                theme, direction = state.split("-")
                self.assertEqual(root.find("html")[0].attrs, {"lang": "en", "dir": direction})
                owners = [node for node in root.find("div") if "data-moo-document-owner" in node.attrs]
                self.assertEqual(len(owners), 1)
                self.assertEqual(owners[0].attrs["data-bs-theme"], theme)
                for name, classes in modes.items():
                    button, = sections[name].find("button")
                    self.assertEqual(button.attrs["type"], "button")
                    self.assertEqual(button.attrs["aria-label"], "Language")
                    self.assertEqual(button.attrs["data-bs-toggle"], "dropdown")
                    self.assertIn("px-2", button.classes())
                    icon, = button.find("svg")
                    self.assertEqual(icon.attrs["aria-hidden"], "true")
                    self.assertEqual(icon.attrs["data-lucide"], "languages")
                    label, = button.find("span")
                    self.assertEqual(label.text, "Language")
                    self.assertEqual(label.classes(), classes)
                    self.assertEqual(button.find("p"), [])

    def test_link_list_heading_destinations_languages_and_current_choice(self):
        for state, (_, sections, html) in self.documents.items():
            for name in ("responsive", "visible", "hidden", "unknown-current"):
                with self.subTest(state=state, name=name):
                    menu, = sections[name].find("ul")
                    self.assertIn("dropdown-menu-end", menu.classes())
                    self.assertTrue(all(node.tag == "li" for node in menu.children))
                    heading, = menu.children[0].find("h6")
                    self.assertEqual(heading.text, "Select language")
                    self.assertIn("dropdown-header", heading.classes())
                    divider, = menu.children[1].find("hr")
                    self.assertIn("dropdown-divider", divider.classes())
                    links = menu.find("a")
                    self.assertEqual([node.text for node in links], ["English", "<Deutsch>"])
                    self.assertEqual([node.attrs["href"] for node in links],
                                     ["/base/project/about-us/", "/base/de/projekt/%C3%BCber-uns/"])
                    self.assertEqual([(node.attrs["lang"], node.attrs["hreflang"]) for node in links],
                                     [("en", "en"), ("de", "de")])
                    current = [node for node in links if node.attrs.get("aria-current") == "true"]
                    self.assertEqual([node.attrs["lang"] for node in current],
                                     [] if name == "unknown-current" else ["de"])
                    self.assertEqual([node.attrs["lang"] for node in links if "active" in node.classes()],
                                     [] if name == "unknown-current" else ["de"])
                    self.assertIn("&lt;Deutsch&gt;", html)
                    self.assertEqual(sections[name].find("deutsch"), [])

    def test_zero_and_one_translation_emit_no_controls(self):
        for state, (_, sections, _) in self.documents.items():
            for name in ("empty", "single"):
                with self.subTest(state=state, name=name):
                    self.assertEqual(sections[name].find("button"), [])
                    self.assertEqual(sections[name].find("ul"), [])

    def test_legacy_label_only_dropdown_keeps_its_fallback_and_link(self):
        for state, (_, sections, _) in self.documents.items():
            with self.subTest(state=state):
                button, = sections["legacy"].find("button")
                self.assertEqual(button.text, "Legacy actions")
                menu, = sections["legacy"].find("ul")
                link, = menu.find("a")
                self.assertEqual(link.text, "Legacy link")
                self.assertEqual(link.attrs["href"], "#legacy")
                self.assertEqual(menu.find("h6"), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
