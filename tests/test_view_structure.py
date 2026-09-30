"""Compiled semantic ownership checks for the local shared-part previews."""

from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
import tempfile
import unittest


DIST = Path(__file__).resolve().parents[1] / "dist"
ROOT = DIST.parent


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
        menu_links = [attrs["href"] for tag, attrs in elements
                      if tag == "a" and attrs.get("data-slot") == "sidebar-menu-button"
                      and attrs.get("aria-current") == "page"]
        self.assertEqual(menu_links, ["/preview/single"])
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


class PublicComponentRendering(unittest.TestCase):
    def build(self, source):
        with tempfile.TemporaryDirectory(prefix="render-contract-", dir=ROOT / "tests/fixtures") as directory:
            root = Path(directory)
            (root / "src/pages").mkdir(parents=True)
            (root / "src/pages/index.astro").write_text(source, encoding="utf-8")
            (root / "astro.config.mjs").write_text(
                'import { defineConfig } from "astro/config";\n'
                'export default defineConfig({ vite: { cacheDir: new URL("./.vite", import.meta.url).pathname } });\n',
                encoding="utf-8",
            )
            result = subprocess.run([str(ROOT / "node_modules/.bin/astro"), "build"],
                                    cwd=root, text=True, capture_output=True)
            output = root / "dist/index.html"
            return result, output.read_text(encoding="utf-8") if output.exists() else ""

    def test_sidebar_rejects_values_outside_the_published_app_contract(self):
        for props, diagnostic in [
            ({"side": "above"}, "Sidebar side"),
            ({"variant": "unknown"}, "Sidebar variant"),
            ({"collapsible": "unknown"}, "Sidebar collapsible"),
            ({"rail": "false"}, "Sidebar rail"),
            ({"id": "bad:id"}, "Sidebar id"),
        ]:
            with self.subTest(props=props):
                result, _ = self.build(
                    '---\nimport Sidebar from "@wpmoo/astro/components/Sidebar.astro";\n'
                    f'const props = {json.dumps(props)};\n---\n<Sidebar {{...props}} />'
                )
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(diagnostic, result.stdout + result.stderr)

    def test_six_content_wrappers_escape_text_and_require_explicit_trusted_html(self):
        names = ["Accordion", "Collapsible", "DataTable", "Tabs", "Toast", "Table"]
        imports = [f'import {name} from "@wpmoo/astro/components/{name}.astro";' for name in names]
        text = '<em data-contract-probe="caller">Caller content & text</em>'
        parts = []
        for trusted in [False, True]:
            suffix = "trusted" if trusted else "text"
            options = " trustedHtml" if trusted else ""
            parts += [
                f'<Accordion id="accordion-{suffix}" items={{[{{ id: "entry", title: "Accordion", content: text }}]}}{options} />',
                f'<Collapsible id="collapsible-{suffix}" title="Collapsible" content={{text}}{options} />',
                f'<DataTable id="datatable-{suffix}" columns={{[{{ key: "body", label: "Body" }}]}} rows={{[{{ id: "entry", cells: {{ body: text }} }}]}} selectable={{false}}{options} />',
                f'<Tabs id="tabs-{suffix}" items={{[{{ id: "entry", title: "Tabs", content: text }}]}}{options} />',
                f'<Toast id="toast-{suffix}" body={{text}}{options} />',
                f'<Table headers={{["Body"]}} rows={{[[text]]}}{options} />',
            ]
        source = "---\n" + "\n".join(imports) + f"\nconst text = {json.dumps(text)};\n---\n" + "\n".join(parts)
        result, html = self.build(source)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        parsed = Markup()
        parsed.feed(html)
        self.assertEqual(len(with_attribute(parsed.elements, "data-contract-probe", "caller")), 6)
        self.assertEqual(html.count("&lt;em data-contract-probe="), 6)

    def test_sidebar_preserves_every_supported_side_variant_collapse_and_rail_value(self):
        props = [dict(id=f"sidebar-{i}", side=side, variant=variant, collapsible=collapse, rail=rail)
                 for i, (side, variant, collapse, rail) in enumerate(
                     (side, variant, collapse, rail)
                     for side in ["left", "right"]
                     for variant in ["sidebar", "floating", "inset"]
                     for collapse in ["icon", "offcanvas", "none"]
                     for rail in [False, True]
                 )]
        source = '---\nimport Sidebar from "@wpmoo/astro/components/Sidebar.astro";\n'
        source += f'const cases = {json.dumps(props)};\n---\n'
        source += '{cases.map(props => <Sidebar {...props} />)}'
        result, html = self.build(source)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        parsed = Markup()
        parsed.feed(html)
        asides = with_attribute(parsed.elements, "data-slot", "sidebar")
        self.assertEqual(len(asides), len(props))
        for (_, attrs), expected in zip(asides, props):
            self.assertEqual(attrs["id"], expected["id"])
            self.assertEqual(attrs["data-side"], expected["side"])
            self.assertEqual(attrs["data-variant"], expected["variant"])
            self.assertEqual(attrs["data-collapsible"], expected["collapsible"])
        self.assertEqual(len([attrs for tag, attrs in parsed.elements if tag == "button" and "data-sidebar-rail" in attrs]), 6)


if __name__ == "__main__":
    unittest.main()
