"""A separate CPT archive consumes the installed public Astro contracts."""

import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

import test_view_structure as native


FIXTURES = Path(__file__).parent / "fixtures"
PACKAGE = FIXTURES / "external-plugin"
EXPORTS = {".", "./content", "./queries", "./views/Single.astro", "./views/Archive.astro", "./views/Loop.astro"}
FILES = {"package.json", "README.md", "LICENSE", "index.js", "index.d.ts", "content.js", "content.d.ts",
         "queries.js", "queries.d.ts", "views/Single.astro", "views/Archive.astro", "views/Loop.astro",
         "routes/index.astro", "routes/[...slug].astro"}


def consumer_files():
    root = FIXTURES / "external-consumer"
    return {str(path.relative_to(root)): path.read_text(encoding="utf-8")
            for path in root.rglob("*") if path.is_file()
            and path.name not in {"package.json", "package-lock.json"}}


class ExternalPluginConsumer(unittest.TestCase):
    build = native.PublicComponentRendering.build

    @classmethod
    def setUpClass(cls):
        native.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        native.PublicComponentRendering.tearDownClass.__func__(cls)

    def test_projects_definition_owns_single_urls_in_both_languages(self):
        root = FIXTURES / "project-routes"
        self.assertTrue((root / "src/definitions.mjs").is_file(), "Projects fixture is absent")
        original = {str(path.relative_to(root)): path.read_text(encoding="utf-8")
                    for path in root.rglob("*") if path.is_file()}
        for base, slash, suffix in [("/", "never", ""), ("/docs", "always", "/")]:
            expected = {"en": ("" if base == "/" else base) + "/project/test-project" + suffix,
                        "de": ("" if base == "/" else base) + "/de/projekt/test-projekt" + suffix}
            for memberships in [False, True]:
                with self.subTest(base=base, memberships=memberships):
                    files = original.copy()
                    files["astro.config.mjs"] = files["astro.config.mjs"].replace('base: "/"', f'base: "{base}"').replace('trailingSlash: "never"', f'trailingSlash: "{slash}"')
                    if memberships:
                        for locale in ["en", "de"]:
                            filename = f"src/content/project/{locale}/test.md"
                            files[filename] = files[filename].replace("status: publish", "status: publish\ntaxonomies:\n  category: [guides, layouts]\n  tag: [astro]")
                    result, _ = self.build(None, files=files, check=True)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertEqual(set(result.generated_html), {"project/test-project/index.html", "de/projekt/test-projekt/index.html"})
                    contract = json.loads(result.generated_data["contract.json"])
                    self.assertEqual({entry["id"]: entry["href"] for entry in contract},
                                     {"en/test.md": expected["en"], "de/test.md": expected["de"]})
                    for locale, filename in [("en", "project/test-project/index.html"), ("de", "de/projekt/test-projekt/index.html")]:
                        parser = native.Markup()
                        parser.feed(result.generated_html[filename])
                        self.assertIn(("link", {"rel": "canonical", "href": "https://example.test" + expected[locale]}), parser.elements)
                        self.assertEqual({attrs["hreflang"]: attrs["href"] for tag, attrs in parser.elements
                                          if tag == "link" and attrs.get("rel") == "alternate"},
                                         {language: "https://example.test" + href for language, href in expected.items()})
                        self.assertEqual(sum(tag == "main" for tag, _ in parser.elements), 1)

    def packed_plugin(self):
        self.assertTrue((PACKAGE / "package.json").is_file(), "The separate sample package has not been implemented")
        temporary = tempfile.TemporaryDirectory(prefix="astro-external-archive-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        result = subprocess.run(["npm", "pack", "--json", "--pack-destination", str(root)],
                                cwd=PACKAGE, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)[0]
        self.assertEqual({item["path"] for item in report["files"]}, FILES)
        with tarfile.open(root / report["filename"]) as archive:
            for member in archive.getmembers():
                if not member.isfile():
                    continue
                self.assertTrue(member.name.startswith("package/"))
                self.assertNotIn("..", Path(member.name).parts)
                target = root / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.extractfile(member).read())
        manifest = json.loads((root / "package/package.json").read_text())
        self.assertEqual(set(manifest["exports"]), EXPORTS)
        self.assertEqual(manifest["peerDependencies"], {"@wpmoo/astro": "0.1.0", "astro": "7.3.3"})
        self.assertTrue(manifest["private"])
        return root / "package"

    def test_separate_archive_has_the_declared_public_surface_and_private_route_closure(self):
        package = self.packed_plugin()
        manifest = json.loads((package / "package.json").read_text())
        for target in manifest["exports"].values():
            for path in target.values() if isinstance(target, dict) else [target]:
                self.assertTrue((package / path).is_file(), path)

    def test_external_json_routes_use_canonical_links_preferences_and_a_reusable_loop(self):
        package = self.packed_plugin()
        result, _ = self.build(None, files=consumer_files(), check=True,
                              packed_modules={"@wpmoo-test/astro-content": package})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"sample/index.html", "sample/ueber/index.html", "sample/fallback/index.html"})
        metadata = json.loads(result.generated_data["contract.json"])
        self.assertEqual(metadata["ids"], ["alpha", "fallback"])
        self.assertEqual(metadata["hrefs"], ["/docs/sample/ueber/", "/docs/sample/fallback/"])
        self.assertEqual(metadata["privateFailures"], ["ERR_PACKAGE_PATH_NOT_EXPORTED"] * 4)
        self.assertEqual(metadata["sourceKind"], "json")
        self.assertEqual(metadata["formats"], [])
        self.assertNotIn("src/data", json.dumps(metadata["context"]))
        archive = result.generated_html["sample/index.html"]
        self.assertEqual(archive.count('href="/docs/sample/ueber/"'), 2)
        self.assertEqual(archive.count('href="/docs/sample/fallback/"'), 2)
        self.assertIn("Reusable sample Loop", archive)
        for path, expected_sidebar, expected_rail, expected_classes in [
            ("sample/index.html", 0, ["container-xl"], {"archive", "type-sample"}),
            ("sample/ueber/index.html", 0, ["container-lg", "py-2"], {"single", "type-sample", "entry-sample--alpha"}),
            ("sample/fallback/index.html", 1, ["container-lg", "py-3"], {"single", "type-sample", "entry-sample--fallback"}),
        ]:
            with self.subTest(path=path):
                markup = native.Markup()
                markup.feed(result.generated_html[path])
                self.assertEqual(sum(tag == "main" for tag, _ in markup.elements), 1)
                self.assertEqual(sum(tag == "h1" for tag, _ in markup.elements), 1)
                self.assertEqual(sum(tag == "aside" for tag, _ in markup.elements), expected_sidebar)
                owners = [attrs for _, attrs in markup.elements if attrs.get("data-moo-document-owner") == "true"]
                self.assertEqual(len(owners), 1)
                self.assertTrue(expected_classes.issubset(set(owners[0]["class"].split())))
                rail = next(attrs for _, attrs in markup.elements if "data-page-container" in attrs)
                self.assertEqual(rail["class"].split(), expected_rail)
        self.assertIn("External JSON body.", result.generated_html["sample/ueber/index.html"])
        self.assertIn('datetime="2026-09-28T01:30:00.000Z"', archive)
        self.assertNotIn("Private draft body.", "".join(result.generated_html.values()))

    def test_json_directory_selection_keeps_the_same_public_routes_and_identity(self):
        package = self.packed_plugin()
        files = consumer_files()
        entries = json.loads(files.pop("src/data/sample.json"))
        for entry in entries:
            files[f'src/data/sample/{entry["id"]}.json'] = json.dumps(entry)
        files["astro.config.mjs"] = files["astro.config.mjs"].replace('"./src/data/sample.json"', '"./src/data/sample/"').replace("source, taxonomies: []", 'source, sourceKind: "json-directory", taxonomies: []')
        files["src/content.config.ts"] = '''import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { jsonEntryId } from "@wpmoo/astro/content";
import { sampleSchema } from "@wpmoo-test/astro-content/content";
export const collections = { sample: defineCollection({ loader: glob({
  base: new URL("./data/sample/", import.meta.url), pattern: "*.json", generateId: jsonEntryId,
}), schema: sampleSchema }) };
'''
        result, _ = self.build(None, files=files, check=True,
                              packed_modules={"@wpmoo-test/astro-content": package})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        metadata = json.loads(result.generated_data["contract.json"])
        self.assertEqual(metadata["sourceKind"], "json-directory")
        self.assertEqual(metadata["ids"], ["alpha", "fallback"])
        self.assertEqual(metadata["hrefs"], ["/docs/sample/ueber/", "/docs/sample/fallback/"])
        self.assertIn("entry-sample--alpha", result.generated_html["sample/ueber/index.html"])

    def test_framework_externalization_opt_out_fails_the_virtual_query_boundary(self):
        package = self.packed_plugin()
        manifest = json.loads((package / "package.json").read_text())
        manifest["astro"] = {"external": True}
        (package / "package.json").write_text(json.dumps(manifest))
        result, _ = self.build(None, files=consumer_files(),
                              packed_modules={"@wpmoo-test/astro-content": package})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ERR_UNSUPPORTED_ESM_URL_SCHEME", result.stdout + result.stderr)
        self.assertIn("astro:", result.stdout + result.stderr)

    def test_external_source_and_factory_failures_are_meaningful(self):
        package = self.packed_plugin()
        for mutation, diagnostic in [
            ("source", "sample missing JSON source file"),
            ("api", "moo.plugins requires version 1 plugin descriptors"),
            ("identity", "moo.plugins has duplicate plugin sample"),
            ("namespace", "moo namespace /sample conflicts between sample and post"),
            ("collection", "sample collection is not declared in the host content config"),
            ("url", "sample URL collision: sample/alpha and fallback both map to /docs/sample/ueber/"),
        ]:
            with self.subTest(mutation=mutation):
                files = consumer_files()
                if mutation == "source":
                    del files["src/data/sample.json"]
                elif mutation == "api":
                    files["astro.config.mjs"] = files["astro.config.mjs"].replace("plugins: [sample({", "plugins: [{ ...sample({").replace("taxonomies: [] })]", "taxonomies: [] }), apiVersion: 2 }]")
                elif mutation == "identity":
                    files["astro.config.mjs"] = files["astro.config.mjs"].replace("plugins: [sample({ source, taxonomies: [] })]", "plugins: [sample({ source }), sample({ source })]")
                elif mutation == "namespace":
                    files["astro.config.mjs"] = 'import { post } from "@wpmoo/astro/plugins/post";\n' + files["astro.config.mjs"].replace("plugins: [sample({ source, taxonomies: [] })]", 'plugins: [sample({ source }), post({ basePath: "/sample" })]')
                elif mutation == "collection":
                    files["src/content.config.ts"] = "export const collections = {};\n"
                else:
                    entries = json.loads(files["src/data/sample.json"])
                    entries[1]["slug"] = "Über"
                    files["src/data/sample.json"] = json.dumps(entries)
                result, _ = self.build(None, files=files, packed_modules={"@wpmoo-test/astro-content": package})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(diagnostic, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
