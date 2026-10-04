"""Compiled semantic ownership checks for the local shared-part previews."""

from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SDK = ROOT / "packages/astro"
DIST = ROOT / "apps/demo/dist"


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
                                cwd=SDK, text=True, capture_output=True)
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

    def build(self, source, *, configuration="", config_imports="", files=None, check=False, extra_modules=(), packed_modules=None, warm=False):
        # Native render fixtures must not trigger the live host's config watcher.
        with tempfile.TemporaryDirectory(prefix="astro-render-contract-") as directory:
            root = Path(directory)
            modules = root / "node_modules"
            (modules / "@wpmoo").mkdir(parents=True)
            (modules / "astro").symlink_to(ROOT / "node_modules/astro", target_is_directory=True)
            (modules / "bootstrap").symlink_to(ROOT / "node_modules/bootstrap", target_is_directory=True)
            (modules / "@wpmoo/ui").symlink_to(ROOT / "node_modules/@wpmoo/ui", target_is_directory=True)
            if check:
                (modules / "@astrojs").mkdir()
                (modules / "@astrojs/check").symlink_to(ROOT / "node_modules/@astrojs/check", target_is_directory=True)
                (modules / "typescript").symlink_to(ROOT / "node_modules/typescript", target_is_directory=True)
            for name in extra_modules:
                target = modules / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(ROOT / "node_modules" / name, target_is_directory=True)
            shutil.copytree(self.package_root, modules / "@wpmoo/astro")
            for name, package_root in (packed_modules or {}).items():
                target = modules / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(package_root, target)
            manifest = json.loads((SDK / "package.json").read_text(encoding="utf-8"))
            (root / "package.json").write_text(json.dumps({
                "name": "public-render-contract", "private": True, "type": "module",
                "dependencies": {"astro": manifest["peerDependencies"]["astro"],
                                 manifest["name"]: manifest["version"],
                                 **{name: json.loads((Path(package_root) / "package.json").read_text())["version"]
                                    for name, package_root in (packed_modules or {}).items()}},
            }), encoding="utf-8")
            (root / "src/pages").mkdir(parents=True)
            if source is not None:
                (root / "src/pages/index.astro").write_text(source, encoding="utf-8")
            for path, content in (files or {}).items():
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
            (root / "astro.config.mjs").write_text(
                (files or {}).get("astro.config.mjs") or (
                'import { defineConfig } from "astro/config";\n'
                'import moo from "@wpmoo/astro";\n'
                'import { page } from "@wpmoo/astro/plugins/page";\n'
                + config_imports + '\n'
                +
                'export default defineConfig({ vite: { cacheDir: new URL("./.vite", import.meta.url).pathname }, '
                + configuration + ' });\n'),
                encoding="utf-8",
            )
            result = subprocess.run([str(ROOT / "node_modules/.bin/astro"), "build"],
                                    cwd=root, text=True, capture_output=True)
            cold_html = cold_data = None
            if warm and result.returncode == 0:
                cold_html = {str(path.relative_to(root / "dist")): path.read_text(encoding="utf-8")
                             for path in (root / "dist").rglob("*.html")}
                cold_data = {str(path.relative_to(root / "dist")): path.read_text(encoding="utf-8")
                             for path in (root / "dist").rglob("*.json")}
                result = subprocess.run([str(ROOT / "node_modules/.bin/astro"), "build"],
                                        cwd=root, text=True, capture_output=True)
            output = root / "dist/index.html"
            result.generated_files = [str(path.relative_to(root / "dist")) for path in (root / "dist").rglob("*") if path.is_file()]
            generated_html = {str(path.relative_to(root / "dist")): path.read_text(encoding="utf-8")
                              for path in (root / "dist").rglob("*.html")}
            generated_data = {str(path.relative_to(root / "dist")): path.read_text(encoding="utf-8")
                              for path in (root / "dist").rglob("*") if path.is_file() and path.suffix in {".json", ".xml"}}
            generated_modules = {path.name: path.read_text(encoding="utf-8")
                                 for path in (root / "dist").glob("*.js")}
            if result.returncode == 0 and check:
                result = subprocess.run([str(ROOT / "node_modules/.bin/astro"), "check"],
                                        cwd=root, text=True, capture_output=True)
            result.generated_html = generated_html
            result.generated_data = generated_data
            result.generated_modules = generated_modules
            result.cold_generated_html = cold_html
            result.cold_generated_data = cold_data
            return result, output.read_text(encoding="utf-8") if output.exists() else ""

    def integrated_files(self):
        return {
            "src/content.config.mjs": (
                'import { defineCollection } from "astro:content";\n'
                'import { glob } from "astro/loaders";\n'
                'import { sourceEntryId } from "@wpmoo/astro/content";\n'
                'import { pageSchema } from "@wpmoo/astro/plugins/page/content";\n'
                'export const collections = { page: defineCollection({\n'
                'loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }),\n'
                'schema: pageSchema }) };\n'
            ),
            "src/content/page/entry.md": "---\ntitle: Content entry\nstatus: publish\n---\nContent body.\n",
        }

    def test_sidebar_links_keep_explicit_names_when_their_visual_text_is_hidden(self):
        source = '''---
import Layout from "@wpmoo/astro/Layout.astro";
import Sidebar from "@wpmoo/astro/includes/Sidebar.astro";
const groups = [{ items: [
  { title: "Contact", href: "/contact", icon: "file-text" },
  { title: "Archive", href: "/archive", icon: "layout-grid", ariaLabel: "Browse archive" },
] }];
---
<Layout title="Sidebar names" sidebar sidebarKey="names" sidebarId="names-sidebar">
  <Sidebar slot="sidebar" id="names-sidebar" brand="Example" brandHref="/" groups={groups} />
  <h1>Sidebar names</h1>
</Layout>
'''
        result, html = self.build(source)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        markup = Markup()
        markup.feed(html)
        links = [attrs for tag, attrs in markup.elements if tag == "a" and attrs.get("data-slot") == "sidebar-menu-button"]
        self.assertEqual([(item["href"], item.get("aria-label")) for item in links],
                         [("/", "Example"), ("/contact", "Contact"), ("/archive", "Browse archive")])
        class Glyphs(HTMLParser):
            def __init__(self):
                super().__init__()
                self.current = None
                self.shapes = {}

            def handle_starttag(self, tag, attrs):
                if tag == "svg":
                    self.current = dict(attrs).get("data-lucide")
                    if self.current:
                        self.shapes[self.current] = []
                elif self.current and tag in {"path", "rect", "circle", "line", "polyline", "polygon", "ellipse"}:
                    self.shapes[self.current].append(tag)

            def handle_endtag(self, tag):
                if tag == "svg":
                    self.current = None

        glyphs = Glyphs()
        glyphs.feed(html)
        self.assertEqual(glyphs.shapes["file-text"], ["path", "path"])
        self.assertEqual(glyphs.shapes["layout-grid"], ["rect"] * 4)

    def test_layout_rejects_an_empty_direct_trigger_name(self):
        source = '''---
import Layout from "@wpmoo/astro/Layout.astro";
import Sidebar from "@wpmoo/astro/includes/Sidebar.astro";
---
<Layout title="Direct label" sidebar sidebarKey="direct" sidebarId="direct-sidebar" ariaLabel=" ">
  <Sidebar slot="sidebar" id="direct-sidebar" brandHref="/" />
  <h1>Direct label</h1>
</Layout>
'''
        result, _ = self.build(source)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Layout trigger label must be nonempty plain text", result.stdout + result.stderr)

    def test_public_parts_reach_layout_includes_and_context_free_views(self):
        source = '''---
import Layout from "@wpmoo/astro/Layout.astro";
import Header from "@wpmoo/astro/includes/Header.astro";
import Footer from "@wpmoo/astro/includes/Footer.astro";
import Archive from "@wpmoo/astro/views/Archive.astro";
import { resolveParts } from "@wpmoo/astro/config";
const parts = resolveParts({
  content: { utilities: ["py-1"] },
  header: { utilities: ["bg-body-tertiary"], breadcrumbUtilities: ["mb-1"] },
  pageHeader: { utilities: ["mb-5"], titleUtilities: ["text-center"], descriptionVariant: "muted", descriptionUtilities: ["mb-3"] },
  loop: { itemUtilities: ["mb-2"], dateStyle: "long" },
  footer: { utilities: ["py-2"], linkUtilities: ["link-primary"] },
});
---
<Layout title="Theme contract" lang="de" parts={parts}>
  <Header slot="header" parts={parts} breadcrumbs={[{label: "Home", href: "/"}]} />
  <Archive title="Entries" description="Summary" parts={parts} lang="de" items={[{id:"entry",title:"Entry",href:"/entry",date:new Date("2026-10-01T23:30:00Z")}]} />
  <Footer slot="footer" parts={parts} homeHref="/" brand="Example" />
</Layout>'''
        result, html = self.build(source, check=True, files={
            "tsconfig.json": '{"extends":"astro/tsconfigs/strict"}',
        })
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        parsed = Markup()
        parsed.feed(html)
        rails = [attrs for _, attrs in parsed.elements if "data-page-container" in attrs]
        self.assertEqual(len(rails), 1)
        self.assertEqual(set(rails[0]["class"].split()), {"container-xl", "py-1"})
        self.assertEqual(len([tag for tag, _ in parsed.elements if tag == "main"]), 1)
        self.assertIn('class="bg-body-tertiary"', html)
        self.assertIn('class="link-primary"', html)
        self.assertIn('class="text-body-secondary mb-3">Summary</span>', html)
        self.assertIn("1. Oktober 2026", html)
        self.assertIn('datetime="2026-10-01T23:30:00.000Z"', html)

    def test_theme_preferences_reach_page_and_post_routes_with_one_entry_override(self):
        files = self.integrated_files()
        files["tsconfig.json"] = '{"extends":"astro/tsconfigs/strict"}'
        files["src/content.config.mjs"] += '''
import { postSchema } from "@wpmoo/astro/plugins/post/content";
collections.post = defineCollection({ loader: glob({ base: new URL("./content/post/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: postSchema });
'''
        files["src/content/post/first.md"] = "---\ntitle: First post\nstatus: publish\npublished_at: \"2026-10-01T12:00:00Z\"\n---\nFirst body.\n"
        files["src/content/post/second.md"] = "---\ntitle: Second post\nstatus: publish\npublished_at: \"2026-09-30T12:00:00Z\"\noptions:\n  parts:\n    content:\n      utilities: []\n---\nSecond body.\n"
        result, _ = self.build(None, configuration='''integrations: [moo({
  site: { defaults: { lang: "de", parts: {
    content: { utilities: ["py-2", "py-md-5"] },
    header: { utilities: ["bg-body-tertiary"], breadcrumbLabel: "Navigation" },
    pageHeader: { titleUtilities: ["text-center"] },
    loop: { dateStyle: "long", emptyText: "Nothing published" },
  } } }, plugins: [page(), post({ label: "Updates" })],
})]''', config_imports='import { post } from "@wpmoo/astro/plugins/post";', files=files, check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for path, utilities in [("entry/index.html", {"py-2", "py-md-5"}), ("posts/index.html", {"py-2", "py-md-5"}),
                                ("posts/first/index.html", {"py-2", "py-md-5"}), ("posts/second/index.html", set())]:
            html = result.generated_html[path]
            parsed = Markup()
            parsed.feed(html)
            rails = [attrs for _, attrs in parsed.elements if "data-page-container" in attrs]
            self.assertEqual(len(rails), 1, path)
            self.assertEqual(set(rails[0]["class"].split()), {"container-xl"} | utilities, path)
            self.assertIn('class="bg-body-tertiary"', html, path)
            self.assertIn('aria-label="Navigation"', html, path)
            self.assertIn('fw-semibold text-center', html, path)
            self.assertIn('lang="de"', html, path)
        self.assertIn("1. Oktober 2026", result.generated_html["posts/first/index.html"])
        self.assertIn("1. Oktober 2026", result.generated_html["posts/index.html"])
        self.assertIn('datetime="2026-10-01T12:00:00.000Z"', result.generated_html["posts/first/index.html"])

    def test_description_and_title_conflicts_fail_at_the_public_configuration_boundary(self):
        for field, token in [("titleUtilities", "fw-normal"), ("descriptionUtilities", "text-primary"), ("descriptionUtilities", "mb-3")]:
            source = '''---
import PageHeader from "@wpmoo/astro/includes/PageHeader.astro";
import { resolveParts } from "@wpmoo/astro/config";
const parts = resolveParts({ pageHeader: { ''' + field + ': ["' + token + '''"] } });
---
<PageHeader title="Title" description="Description" parts={parts} />'''
            result, _ = self.build(source)
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn(f"parts.pageHeader.{field}", result.stdout + result.stderr)

    def test_archive_date_locale_does_not_change_canonical_post_links(self):
        files = {
            "src/content.config.mjs": '''import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { postSchema } from "@wpmoo/astro/plugins/post/content";
export const collections = { post: defineCollection({ loader: glob({ base: new URL("./content/post/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: postSchema }) };''',
            "src/content/post/Über.md": '---\ntitle: About\nstatus: publish\npublished_at: "2025-10-01T12:00:00Z"\n---\nPost body.\n',
        }
        result, _ = self.build(None, configuration='''integrations: [moo({ plugins: [post()], site: {
  defaults: { lang: "en" }, types: { post: { views: { archive: { lang: "de", parts: { loop: { dateStyle: "long" } } } } } },
} })]''', config_imports='import { post } from "@wpmoo/astro/plugins/post";', files=files)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"posts/index.html", "posts/uber/index.html"})
        archive = result.generated_html["posts/index.html"]
        self.assertIn('href="/posts/uber"', archive)
        self.assertIn("1. Oktober 2025", archive)

    def test_native_page_literals_require_canonical_urls_but_endpoint_paths_do_not(self):
        for filename, valid in [("About.astro", False), ("about.astro", True)]:
            with self.subTest(filename=filename):
                files = self.integrated_files()
                files[f"src/pages/{filename}"] = "<h1>Native page</h1>"
                files["src/pages/Metadata.json.ts"] = 'export const GET = () => Response.json({ available: true });'
                result, _ = self.build("<h1>Home</h1>", configuration="integrations: [moo({ plugins: [page()] })]", files=files)
                if valid:
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                else:
                    self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertRegex(result.stdout + result.stderr, r"(?s)About\.astro.*canonical|canonical.*About\.astro")

    def test_native_dynamic_page_values_require_canonical_concrete_urls(self):
        for value, valid in [("Widget", False), ("ä", False), ("widget", True)]:
            with self.subTest(value=value):
                files = self.integrated_files()
                files["src/pages/product-[ID].astro"] = (
                    '---\nexport function getStaticPaths() { return [{ params: { ID: '
                    + json.dumps(value) + ' } }]; }\n---\n<h1>Product</h1>'
                )
                result, _ = self.build("<h1>Home</h1>", configuration="integrations: [moo({ plugins: [page()] })]", files=files)
                if valid:
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                else:
                    self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertIn("product-[ID].astro", result.stdout + result.stderr)
                    self.assertIn("canonical", result.stdout + result.stderr)

    def test_native_and_content_concrete_path_conflicts_are_fatal(self):
        files = self.integrated_files()
        files["src/content/page/about.md"] = "---\ntitle: About\nstatus: publish\n---\nAbout content.\n"
        files["src/pages/about.astro"] = "<h1>Native About</h1>"
        result, _ = self.build("<h1>Home</h1>", configuration="integrations: [moo({ plugins: [page()] })]", files=files)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("about", result.stdout + result.stderr)
        self.assertRegex(result.stdout + result.stderr, r"[Cc]onflict|[Dd]uplicate")

    def test_legacy_host_page_can_split_a_declared_catchall_without_root_archives(self):
        files = self.integrated_files()
        files["src/content/page/about.md"] = "---\ntitle: About\nstatus: publish\n---\nAbout content.\n"
        files["src/pages/about.astro"] = '<h1>Native About</h1>'
        files["src/pages/[...slug].astro"] = '''---
import { getPagePaths } from "@wpmoo/astro/plugins/page/queries";
import Layout from "@wpmoo/astro/Layout.astro";
export async function getStaticPaths() { return (await getPagePaths()).filter(path => path.props.entry.id !== "about.md"); }
const { entry } = Astro.props;
---
<Layout title={entry.data.title}><h1>{entry.data.title}</h1></Layout>'''
        result, _ = self.build(None, configuration='integrations: [moo({ plugins: [page({ routes: { single: "host" } })] })]', files=files)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("about/index.html", result.generated_html)

    def test_ui_only_native_urls_are_host_owned(self):
        files = {"src/pages/About.astro": "<h1>Native page</h1>"}
        result, _ = self.build("<h1>Home</h1>", configuration="integrations: [moo({ plugins: [] })]", files=files)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_public_site_context_cannot_mutate_another_route_preferences(self):
        source = '''---
import { getSiteContext } from "@wpmoo/astro/context";
import { resolvePageOptions } from "@wpmoo/astro/config";
const first = getSiteContext();
if (!Object.isFrozen(first.site.defaults) || !Object.isFrozen(first.site.types.page.sidebar)
    || !Object.isFrozen(first.plugins[0].contentTypes[0].formats)) {
  throw new Error("Public site context exposes mutable route preferences");
}
for (const [record, key, value] of [
  [first.site.defaults, "pageWidth", "fluid"],
  [first.site.types.page.sidebar, "side", "right"],
  [first.plugins[0].contentTypes[0].formats, "0", "mdx"],
]) {
  let rejected = false;
  try { record[key] = value; } catch { rejected = true; }
  if (!rejected) throw new Error("A public context mutation escaped the readonly boundary");
}
const second = getSiteContext();
const options = resolvePageOptions(second.site, "page", "single");
if (options.pageWidth !== "xl" || options.sidebar.side !== "left") {
  throw new Error("A later route received changed preferences");
}
if ("root" in second || "sources" in second) throw new Error("Private source locations leaked");
---
<h1>Immutable public context</h1>'''
        result, _ = self.build(source, configuration='integrations: [moo({ plugins: [page()], site: { types: { page: { sidebar: {} } } } })]',
                               files=self.integrated_files())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_route_context_enforces_server_and_integration_boundaries(self):
        for source, configuration, diagnostic in [
            ('<h1>Client context</h1><script>import { getSiteContext } from "@wpmoo/astro/context"; console.log(getSiteContext());</script>',
             'integrations: [moo({ plugins: [page()] })]', "server-only"),
            ('---\nimport { getSiteContext } from "@wpmoo/astro/context"; const context = getSiteContext();\n---\n<h1>{context.site.brand}</h1>',
             '', "virtual:wpmoo-astro/routes"),
            ('---\nimport context from "virtual:wpmoo-astro/routes";\n---\n<h1>{context.site.brand}</h1>',
             'integrations: [moo({ plugins: [page()] })]', "private to @wpmoo/astro/context"),
        ]:
            with self.subTest(diagnostic=diagnostic):
                result, _ = self.build(source, configuration=configuration, files=self.integrated_files())
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(diagnostic, result.stdout + result.stderr)

    def test_native_concrete_path_guard_preserves_the_host_subpath(self):
        for value, valid in [("Widget", False), ("widget", True)]:
            with self.subTest(value=value):
                files = self.integrated_files()
                files["src/pages/product-[ID].astro"] = (
                    '---\nexport function getStaticPaths() { return [{ params: { ID: '
                    + json.dumps(value) + ' } }]; }\n---\n<h1>Product</h1>'
                )
                result, _ = self.build("<h1>Home</h1>", configuration='base: "/docs", integrations: [moo({ plugins: [page()] })]', files=files)
                if valid:
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                else:
                    self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertIn("product-[ID].astro", result.stdout + result.stderr)
                    self.assertIn("canonical", result.stdout + result.stderr)

    def test_integration_generates_types_for_its_private_route_context(self):
        files = self.integrated_files()
        files["tsconfig.json"] = json.dumps({"extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "**/*"], "exclude": ["dist"]})
        files["src/context-types.ts"] = '''import type context from "virtual:wpmoo-astro/routes";
import type { SiteContext, NavigationItem } from "@wpmoo/astro/context";
export const publicContext: SiteContext = {} as typeof context;
export const privateRoot: string = ({} as typeof context).root;
export const navigation: NavigationItem = { label: "Contact", href: "/contact", active: true };
// @ts-expect-error Public metadata must not expose private source locations.
publicContext.root;
// @ts-expect-error Resolved defaults are readonly.
publicContext.site.defaults.pageWidth = "fluid";
// @ts-expect-error Nested plugin metadata is readonly.
publicContext.plugins[0].contentTypes[0].formats[0] = "mdx";
'''
        result, _ = self.build("<h1>Typed route context</h1>", configuration="integrations: [moo({ plugins: [page()] })]", files=files, check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("0 errors", result.stdout + result.stderr)

    def test_published_page_index_remains_home_under_a_subpath_regardless_of_navigation_order(self):
        files = self.integrated_files()
        files["src/content/page/index.md"] = "---\ntitle: Home\nstatus: publish\nnavOrder: 99\n---\nHome content.\n"
        files["src/content/page/entry.md"] = "---\ntitle: Content entry\nstatus: publish\nnavOrder: 1\n---\nContent body.\n"
        for trailing, expected in [("always", "/docs/"), ("never", "/docs"), ("ignore", "/docs/")]:
            with self.subTest(trailing=trailing):
                result, html = self.build(None, configuration=f'base: "/docs", trailingSlash: "{trailing}", integrations: [moo({{ plugins: [page()] }})]', files=files)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                parsed = Markup()
                parsed.feed(html)
                footer = next(index for index, (tag, _) in enumerate(parsed.elements) if tag == "footer")
                footer_hrefs = [attrs["href"] for tag, attrs in parsed.elements[footer:] if tag == "a"]
                self.assertEqual(footer_hrefs, [expected])

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
        self.assertEqual(len(lists), 2)
        self.assertTrue({"post", "post-news", "tag-astro"}.issubset(lists[0]))
        self.assertTrue({"type-team", "entry-team--cng"}.issubset(lists[1]))
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
