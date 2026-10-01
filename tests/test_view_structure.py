"""Compiled semantic ownership checks for the local shared-part previews."""

from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
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


class SlotCases(HTMLParser):
    def __init__(self):
        super().__init__()
        self.cases = {}
        self.current = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "section":
            self.current = attributes["id"]
            self.cases[self.current] = {"elements": [], "text": []}
        if self.current:
            self.cases[self.current]["elements"].append((tag, attributes))

    def handle_endtag(self, tag):
        if tag == "section":
            self.current = None

    def handle_data(self, data):
        if self.current:
            self.cases[self.current]["text"].append(data)


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
        self.assertEqual(len([tag for tag, attrs in single if tag == "article" and "post-announcement" in attrs.get("class", "").split()]), 1)


class PublicComponentRendering(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.package_directory = tempfile.TemporaryDirectory(prefix="astro-render-package-")
        archive_root = Path(cls.package_directory.name)
        packed = subprocess.run(["npm", "pack", "--json", "--pack-destination", str(archive_root)],
                                cwd=ROOT, text=True, capture_output=True)
        if packed.returncode != 0:
            cls.package_directory.cleanup()
            raise RuntimeError(packed.stdout + packed.stderr)
        filename = json.loads(packed.stdout)[0]["filename"]
        cls.package_root = archive_root / "package"
        with tarfile.open(archive_root / filename) as archive:
            for member in archive.getmembers():
                if not member.isfile():
                    continue
                parts = Path(member.name).parts
                if not parts or parts[0] != "package" or ".." in parts:
                    raise RuntimeError(f"Unexpected npm archive member: {member.name}")
                target = archive_root / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as content:
                    target.write_bytes(content.read())

    @classmethod
    def tearDownClass(cls):
        cls.package_directory.cleanup()

    def build(self, source):
        # Native render fixtures must not trigger the live host's config watcher.
        with tempfile.TemporaryDirectory(prefix="astro-render-contract-") as directory:
            root = Path(directory)
            modules = root / "node_modules"
            (modules / "@wpmoo").mkdir(parents=True)
            (modules / "astro").symlink_to(ROOT / "node_modules/astro", target_is_directory=True)
            (modules / "bootstrap").symlink_to(ROOT / "node_modules/bootstrap", target_is_directory=True)
            (modules / "@wpmoo/ui").symlink_to(ROOT / "node_modules/@wpmoo/ui", target_is_directory=True)
            shutil.copytree(self.package_root, modules / "@wpmoo/astro")
            manifest = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
            (root / "package.json").write_text(json.dumps({
                "name": "public-render-contract", "private": True, "type": "module",
                "dependencies": {"astro": manifest["peerDependencies"]["astro"],
                                 manifest["name"]: manifest["version"]},
            }), encoding="utf-8")
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

    def test_generic_loop_rejects_unsafe_hrefs_during_native_render(self):
        for href in ["javascript:alert(1)", " data:text/html,unsafe", "VBScript:unsafe", "java\nscript:unsafe"]:
            with self.subTest(href=href):
                result, _ = self.build(
                    '---\nimport Loop from "@wpmoo/astro/views/Loop.astro";\n'
                    f'const items = [{{ id: "entry", title: "Entry", href: {json.dumps(href)} }}];\n'
                    '---\n<Loop items={items} />'
                )
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("Loop items[0].href", result.stdout + result.stderr)

    def test_shared_views_keep_page_and_entry_classes_on_their_existing_owners(self):
        source = '''---
import Layout from "@wpmoo/astro/Layout.astro";
import Header from "@wpmoo/astro/includes/Header.astro";
import Footer from "@wpmoo/astro/includes/Footer.astro";
import Archive from "@wpmoo/astro/views/Archive.astro";
import Single from "@wpmoo/astro/views/Single.astro";
const items = [
  { id: "news.md", title: "News <text>", href: "/news", entryContext: {
    type: "post", id: "news.md", source: "markdown", taxonomies: { tag: ["astro"] },
  } },
  { id: "cng", title: "Team", href: "https://example.test/team", entryContext: {
    type: "team", id: "cng", source: "json",
  } },
  { id: "contact", title: "Contact", href: "mailto:hello@example.test" },
  { id: "phone", title: "Phone", href: "tel:+491234" },
];
const context = { type: "page", id: "contact.mdx", source: "markdown" } as const;
---
<Layout title="Ownership" pageContext={{ view: "archive", type: "post" }}>
  <Header slot="header" breadcrumbs={[{ label: "Home", href: "/" }, { label: "Ownership" }]} />
  <Archive title="Entries" items={items} />
  <Single title="Hidden fallback" entryContext={context}>
    <Fragment slot="page-header" />
    <p>Caller-owned content</p>
  </Single>
  <Footer slot="footer" homeHref="/" brand="Brand <text>" />
</Layout>'''
        result, html = self.build(source)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        parsed = Markup()
        parsed.feed(html)
        owners = with_attribute(parsed.elements, "data-moo-document-owner", "true")
        self.assertEqual(len(owners), 1)
        self.assertEqual(owners[0][1]["class"].split(), ["moo-ui", "archive", "post"])
        self.assertEqual(len(with_attribute(parsed.elements, "data-layout", "app")), 1)
        self.assertEqual(len(with_attribute(parsed.elements, "data-slot", "page")), 1)
        self.assertEqual(len([attrs for _, attrs in parsed.elements if "data-page-container" in attrs]), 1)
        self.assertEqual(len([tag for tag, _ in parsed.elements if tag == "main"]), 1)
        self.assertEqual(with_attribute(parsed.elements, "id", "main-content")[0][1]["tabindex"], "-1")
        self.assertEqual(len([tag for tag, _ in parsed.elements if tag == "h1"]), 1)
        articles = [attrs for tag, attrs in parsed.elements if tag == "article"]
        self.assertEqual([attrs.get("class", "").split() for attrs in articles], [["page", "page-id--contact_002e_mdx"]])
        lists = [attrs.get("class", "").split() for tag, attrs in parsed.elements
                 if tag == "li" and ("post-news" in attrs.get("class", "") or "entry-team--cng" in attrs.get("class", ""))]
        self.assertEqual(lists, [["post", "post-news", "tag-astro", "mb-3"], ["type-team", "entry-team--cng", "mb-3"]])
        links = [attrs["href"] for tag, attrs in parsed.elements if tag == "a"]
        for href in ["/news", "https://example.test/team", "mailto:hello@example.test", "tel:+491234"]:
            self.assertIn(href, links)
        self.assertIn("News &lt;text&gt;", html)
        self.assertIn("Brand &lt;text&gt;", html)
        self.assertNotIn("Hidden fallback", html)

    def test_shared_views_preserve_omitted_empty_and_replaced_slots(self):
        result, html = self.build('''---
import Single from "@wpmoo/astro/views/Single.astro";
import Archive from "@wpmoo/astro/views/Archive.astro";
import Loop from "@wpmoo/astro/views/Loop.astro";
import PageHeader from "@wpmoo/astro/includes/PageHeader.astro";
const items = [{ id: "entry", title: "Fallback entry", href: "/entry", date: new Date("2026-10-01T00:30:00+03:00") }];
---
<section id="single-default"><Single title="Fallback Single"><p>Body</p></Single></section>
<section id="single-empty"><Single title="Suppressed Single"><Fragment slot="page-header" /><p>Body</p></Single></section>
<section id="single-custom"><Single title="Suppressed Single">
  <PageHeader slot="page-header" title="Custom Single" />
  <p>Body</p><p slot="after-content">After content</p>
</Single></section>
<section id="archive-default"><Archive title="Fallback Archive" items={items} /></section>
<section id="archive-empty"><Archive title="Archive with empty Loop" items={items}><Fragment slot="loop" /></Archive></section>
<section id="archive-custom"><Archive title="Archive with replaced Loop" items={items}>
  <p slot="loop">Caller list</p><p slot="after-list">After list</p>
</Archive></section>
<section id="loop-embedded"><h2>Related entries</h2><Loop items={items} titleVariant="subsection-title" /></section>
''')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        parsed = SlotCases()
        parsed.feed(html)
        headings = lambda case, tag: [attrs for name, attrs in parsed.cases[case]["elements"] if name == tag]
        text = lambda case: "".join(parsed.cases[case]["text"])
        self.assertEqual(len(headings("single-default", "h1")), 1)
        self.assertIn("Fallback Single", text("single-default"))
        self.assertEqual(headings("single-empty", "h1"), [])
        self.assertNotIn("Suppressed Single", text("single-empty"))
        self.assertEqual(len(headings("single-custom", "h1")), 1)
        self.assertIn("Custom Single", text("single-custom"))
        self.assertIn("After content", text("single-custom"))
        self.assertNotIn("Suppressed Single", text("single-custom"))
        for case in ["archive-default", "archive-empty", "archive-custom"]:
            self.assertEqual(len(headings(case, "h1")), 1)
        self.assertEqual(len(headings("archive-default", "h2")), 1)
        self.assertEqual(headings("archive-default", "time"), [{"datetime": "2026-09-30T21:30:00.000Z"}])
        self.assertIn("2026-09-30", text("archive-default"))
        for case in ["archive-empty", "archive-custom"]:
            self.assertEqual(headings(case, "h2"), [])
            self.assertNotIn("Fallback entry", text(case))
        self.assertIn("Caller list", text("archive-custom"))
        self.assertIn("After list", text("archive-custom"))
        self.assertEqual(len(headings("loop-embedded", "h2")), 1)
        self.assertEqual(len(headings("loop-embedded", "h3")), 1)
        self.assertEqual(headings("loop-embedded", "h1"), [])


if __name__ == "__main__":
    unittest.main()
