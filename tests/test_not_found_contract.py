"""Compiled native error semantics, without claiming HTTP or visual acceptance."""
import json
from pathlib import Path
import unittest

import test_view_structure as native


def files(name="not-found"):
    root = native.ROOT / "tests/fixtures" / name
    return {str(path.relative_to(root)): path.read_text() for path in root.rglob("*")
            if path.is_file() and (str(path.relative_to(root)).startswith("src/")
                                   or path.name in {"astro.config.mjs", "tsconfig.json"})}


class NotFoundContracts(unittest.TestCase):
    build = native.PublicComponentRendering.build

    @classmethod
    def setUpClass(cls):
        native.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        native.PublicComponentRendering.tearDownClass.__func__(cls)

    def assert_error(self, html, locale, title, href, content_class="py-2"):
        parser = native.Markup()
        parser.feed(html)
        elements = parser.elements
        for tag in ["html", "body", "main", "h1"]:
            self.assertEqual(sum(name == tag for name, _ in elements), 1, tag)
        self.assertIn(("html", {"lang": locale, "dir": "ltr"}), elements)
        self.assertEqual(len(native.with_attribute(elements, "data-moo-document-owner", "true")), 1)
        self.assertEqual(sum(tag == "script" and bool(attrs.get("src")) for tag, attrs in elements), 1)
        rails = [attrs for _, attrs in elements if "data-page-container" in attrs]
        self.assertEqual(len(rails), 1)
        self.assertEqual(rails[0]["class"].split(), ["container-xl"] + ([content_class] if content_class else []))
        content = native.Markup()
        content.feed("<main" + html.split("<main", 1)[1].split("</main>", 1)[0] + "</main>")
        recovery = [attrs for tag, attrs in content.elements if tag == "a" and "btn" in attrs.get("class", "").split() and attrs.get("href") == href]
        self.assertEqual(len(recovery), 1)
        self.assertIn(title, html)
        self.assertIn(">404<", html)
        self.assertFalse(any(tag == "link" and attrs.get("rel") in {"canonical", "alternate"} for tag, attrs in elements))
        self.assertFalse(any(attrs.get("property", "").startswith("og:") or attrs.get("name", "").startswith("twitter:") or attrs.get("type") == "application/ld+json" for _, attrs in elements))

    def test_default_error_without_collections(self):
        result, _ = self.build(None, files=files(), check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_error(result.generated_html["404.html"], "en", "Page not found", "/site/")
        self.assert_error(result.generated_html["de/404/index.html"], "de", "Seite nicht gefunden", "/site/de/")
        data = json.loads(result.generated_data["not-found-contract.json"])
        self.assertEqual([item["homeHref"] for item in data], ["/site/", "/site/de/"])
        self.assertEqual(data[1]["languageLinks"], [{"locale": "en", "href": "/site/"}, {"locale": "de", "href": "/site/de/"}])

    def test_host_copy_slots_and_shared_parts(self):
        result, _ = self.build(None, files=files("not-found-host"), check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        html = result.generated_html["de/404/index.html"]
        self.assert_error(html, "de", "&lt;script&gt;", "/site/de/", "")
        self.assertIn("data-host-error-title", html)
        self.assertIn("data-host-error-action", html)
        self.assertIn("Zurück", html)
        self.assertNotIn('<script>alert("copy")</script>', html)
        self.assertIn('data-bs-theme="dark"', html)
        self.assertNotIn("Die angeforderte Seite wurde nicht gefunden.</p>", html)

    def test_literal_error_collision(self):
        fixture = files()
        fixture["src/pages/404.astro"] = "<h1>Host error</h1>"
        result, _ = self.build(None, files=fixture)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('moo.notFound.routeOwner: "host"', result.stdout + result.stderr)
        fixture = files("not-found-host")
        del fixture["src/pages/de/404.astro"]
        result, _ = self.build(None, files=fixture)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("one project route at /de/404", result.stdout + result.stderr)
        for locale in ["en", "de"]:
            fixture = files()
            fixture["astro.config.mjs"] = fixture["astro.config.mjs"].replace('import moo from "@wpmoo/astro";', 'import moo from "@wpmoo/astro";\nimport { page } from "@wpmoo/astro/plugins/page";').replace("plugins: []", "plugins: [page()]")
            fixture["src/content.config.mjs"] = native.PublicComponentRendering.integrated_files(self)["src/content.config.mjs"]
            fixture[f"src/content/page/{locale}/error.md"] = f'---\ntitle: Collision\nstatus: publish\nlocale: {locale}\nslug: "404"\n---\nMust not become an error owner.\n'
            result, _ = self.build(None, files=fixture)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("reserved", result.stdout + result.stderr)
        from test_taxonomy_contract import taxonomy_files
        fixture = taxonomy_files()
        fixture["src/definitions.mjs"] = fixture["src/definitions.mjs"].replace('archive: { include: "descendants" }', 'archive: { basePath: "/" }')
        terms = json.loads(fixture["src/data/category.json"])
        terms[1]["slug"] = "404"
        fixture["src/data/category.json"] = json.dumps(terms)
        result, _ = self.build(None, files=fixture, config_imports='import { post } from "@wpmoo/astro/plugins/post"; import { taxonomies, bindings } from "./src/definitions.mjs";', configuration='integrations: [moo({ plugins: [page({ taxonomies: bindings }), post({ taxonomies: bindings })], taxonomies })]')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("reserved root URL /404", result.stdout + result.stderr)

    def test_neighboring_content_does_not_reserve_the_error_namespace(self):
        fixture = files()
        fixture["astro.config.mjs"] = fixture["astro.config.mjs"].replace('import moo from "@wpmoo/astro";', 'import moo from "@wpmoo/astro";\nimport { page } from "@wpmoo/astro/plugins/page";').replace("plugins: []", "plugins: [page()]")
        fixture["src/content.config.mjs"] = native.PublicComponentRendering.integrated_files(self)["src/content.config.mjs"]
        for slug in ["404-guide", "404/child"]:
            fixture[f"src/content/page/en/{slug}.md"] = f"---\ntitle: Neighbor\nstatus: publish\nlocale: en\n---\nKnown neighboring content.\n"
        result, _ = self.build(None, files=fixture)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for output in ["404-guide/index.html", "404/child/index.html", "404.html"]:
            self.assertIn(output, result.generated_html)

    def test_error_has_one_shell_and_recovery_link(self):
        fixture = files()
        fixture["astro.config.mjs"] = fixture["astro.config.mjs"].replace('defaultLocale: "en"', 'defaultLocale: "de"').replace('prefixDefaultLocale: false', 'prefixDefaultLocale: true').replace('brand: "Recovery",', 'brand: "Recovery", defaults: { lang: "de" },')
        result, _ = self.build(None, files=fixture)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for output, locale, title in [("404.html", "de", "Seite nicht gefunden"), ("de/404/index.html", "de", "Seite nicht gefunden"), ("en/404/index.html", "en", "Page not found")]:
            self.assert_error(result.generated_html[output], locale, title, f"/site/{locale}/")


if __name__ == "__main__":
    unittest.main()
