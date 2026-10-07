"""Functional section identity checks on actual native Astro build output."""

from html.parser import HTMLParser
from pathlib import Path
import sys
import unittest
from urllib.parse import unquote


ROOTS = [Path(path).resolve() for path in sys.argv[1:]]
sys.argv[1:] = []
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}


class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.nodes = []
        self.stack = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "parents": list(self.stack), "text": ""}
        self.nodes.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1]["tag"] == tag:
            self.stack.pop()

    def handle_data(self, data):
        for node in self.stack:
            node["text"] += data


class NativeTocContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not ROOTS or any(not root.is_dir() for root in ROOTS):
            raise AssertionError("pass existing native build output directories")
        cls.documents = [(path, Document(path.read_text()))
                         for root in ROOTS for path in root.rglob("*.html")]

    def test_explicit_scope_and_encoded_fragments_resolve_to_native_sections(self):
        checked = 0
        for path, document in self.documents:
            tocs = [node for node in document.nodes if "data-toc" in node["attrs"]]
            if not tocs:
                continue
            with self.subTest(path=path):
                ids = [node["attrs"]["id"] for node in document.nodes if node["attrs"].get("id")]
                self.assertEqual(len(ids), len(set(ids)), "duplicate native identity")
                by_id = {node["attrs"]["id"]: node for node in document.nodes if node["attrs"].get("id")}
                for toc in tocs:
                    scope_id = toc["attrs"].get("data-toc-content")
                    scope = by_id[scope_id] if scope_id else next(
                        node for node in reversed(toc["parents"])
                        if "moo-ui" in node["attrs"].get("class", "").split())
                    scroll_id = toc["attrs"].get("data-toc-scroll-root")
                    if scroll_id:
                        scroll = by_id[scroll_id]
                        self.assertTrue(scroll is scope or scroll in scope["parents"])
                    links = [node for node in document.nodes if node["tag"] == "a" and toc in node["parents"]]
                    self.assertTrue(links)
                    for link in links:
                        href = link["attrs"]["href"]
                        self.assertTrue(href.startswith("#"))
                        target = by_id[unquote(href[1:])]
                        self.assertIn(scope, target["parents"])
                        checked += 1
        self.assertGreater(checked, 0)

    def test_generic_host_preserves_escaped_labels_and_unicode_target_identity(self):
        matches = [document for _, document in self.documents
                   if any(node["attrs"].get("id") == "über/uns" for node in document.nodes)]
        self.assertTrue(matches, "generic placement host must be built")
        for document in matches:
            labels = [node["text"] for node in document.nodes if node["tag"] == "a"]
            self.assertIn("<Deutsch>", labels)
            self.assertIn("<Introduction>", labels)
            self.assertFalse(any(node["tag"] in {"deutsch", "introduction"} for node in document.nodes))
            self.assertTrue(any(node["attrs"].get("href") == "#%C3%BCber%2Funs" for node in document.nodes))


if __name__ == "__main__":
    unittest.main()
