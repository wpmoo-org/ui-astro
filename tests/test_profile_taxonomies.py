"""Installed public taxonomy queries retain mixed built-in and packaged types."""

import json
from pathlib import Path
import unittest

import test_external_plugin as external
import test_view_structure as native


FIXTURES = Path(__file__).parent / "fixtures"


def profile_files(name):
    root = FIXTURES / name
    return {str(path.relative_to(root)): path.read_text(encoding="utf-8")
            for path in root.rglob("*") if path.is_file()
            and path.name not in {"package.json", "package-lock.json"}}


class MixedTaxonomyConsumers(unittest.TestCase):
    build = native.PublicComponentRendering.build
    packed_plugin = external.ExternalPluginConsumer.packed_plugin

    @classmethod
    def setUpClass(cls):
        native.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        native.PublicComponentRendering.tearDownClass.__func__(cls)

    def test_shared_taxonomy_profile_preserves_direct_descendant_and_empty_results(self):
        files = profile_files("taxonomy")
        self.assertIn("astro.config.mjs", files, "The taxonomy consumer fixture is missing")
        result, _ = self.build(None, files=files, check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        contract = json.loads(result.generated_data["taxonomy.json"])
        self.assertEqual(contract["direct"], ["post:announcement.md"])
        self.assertEqual(contract["descendants"], ["page:contact.md", "post:announcement.md"])
        self.assertEqual(contract["empty"], [])
        self.assertEqual(contract["hrefs"], ["/docs/contact/", "/docs/posts/announcement/"])
        self.assertEqual(len(contract["paths"]), 4)
        self.assertEqual(set(result.generated_html), {"contact/index.html", "posts/index.html", "posts/announcement/index.html",
            "topics/category/parent/index.html", "topics/category/child/index.html", "topics/tag/astro/index.html", "topics/tag/empty/index.html"})
        self.assertIn("No items yet.", result.generated_html["topics/tag/empty/index.html"])

    def test_custom_taxonomy_profile_combines_page_post_and_separately_packed_samples(self):
        files = profile_files("external-taxonomy")
        self.assertIn("astro.config.mjs", files, "The external taxonomy consumer fixture is missing")
        result, _ = self.build(None, files=files, check=True,
                              packed_modules={"@wpmoo-test/astro-content": self.packed_plugin()})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        contract = json.loads(result.generated_data["taxonomy.json"])
        self.assertEqual(contract["sectorDirect"], ["page:contact.md", "post:announcement.md"])
        self.assertEqual(contract["sectorDescendants"], ["page:contact.md", "post:announcement.md", "sample:alpha"])
        self.assertEqual(contract["sectorEmpty"], [])
        self.assertEqual(contract["sectorHrefs"], ["/docs/contact", "/docs/posts/announcement", "/docs/sample/ueber"])
        self.assertEqual(len(contract["paths"]), 7)
        archive = result.generated_html["topics/sector/oeffentlich/index.html"]
        main = archive.split("<main", 1)[1].split("</main>", 1)[0]
        for href in ["/docs/contact", "/docs/posts/announcement", "/docs/sample/ueber"]:
            self.assertEqual(main.count(f'href="{href}"'), 1)
        self.assertIn("tax-sector--foundation", archive)
        self.assertIn("entry-sample--alpha", archive)
        self.assertIn("tax-sector--community", archive)
        self.assertIn('datetime="2026-09-20T12:00:00.000Z"', archive)
        self.assertNotIn("Draft body.", archive)
        self.assertNotIn("Private draft body.", archive)
        self.assertNotIn("src/data/", json.dumps(contract["context"]))
        for path, html in result.generated_html.items():
            with self.subTest(path=path):
                markup = native.Markup()
                markup.feed(html)
                self.assertEqual(sum(tag == "h1" for tag, _ in markup.elements), 1)
                self.assertEqual(sum(tag == "main" for tag, _ in markup.elements), 1)
                self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in markup.elements), 1)

    def test_disabled_archives_keep_the_same_queryable_references_without_term_routes(self):
        files = profile_files("external-taxonomy")
        self.assertIn("src/definitions.mjs", files)
        files["src/definitions.mjs"] = files["src/definitions.mjs"].replace('{ include: "descendants" }', "false").replace("archive: {}", "archive: false")
        result, _ = self.build(None, files=files,
                              packed_modules={"@wpmoo-test/astro-content": self.packed_plugin()})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        contract = json.loads(result.generated_data["taxonomy.json"])
        self.assertEqual(contract["paths"], [])
        self.assertEqual(contract["sectorDescendants"], ["page:contact.md", "post:announcement.md", "sample:alpha"])
        self.assertEqual(contract["sectorHrefs"], ["/docs/contact", "/docs/posts/announcement", "/docs/sample/ueber"])
        self.assertTrue(all(not path.startswith("topics/") for path in result.generated_html))
        self.assertIn("tax-sector--community", result.generated_html["sample/ueber/index.html"])


if __name__ == "__main__":
    unittest.main()
