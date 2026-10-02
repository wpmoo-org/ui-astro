"""CMS-neutral authored files compile through host-owned schemas and renderers."""

import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

import test_view_structure as native


FIXTURE = Path(__file__).parent / "fixtures/content-editing"


def authored_files():
    return {str(path.relative_to(FIXTURE)): path.read_text(encoding="utf-8")
            for path in FIXTURE.rglob("*") if path.is_file()
            and path.name not in {"package.json", "package-lock.json"}}


class EditableContentConsumer(unittest.TestCase):
    build = native.PublicComponentRendering.build

    @classmethod
    def setUpClass(cls):
        native.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        native.PublicComponentRendering.tearDownClass.__func__(cls)

    def test_editable_profile_keeps_metadata_sections_and_one_public_shell(self):
        files = authored_files()
        self.assertIn("astro.config.mjs", files, "The CMS-neutral file consumer is missing")
        result, _ = self.build(None, files=files, check=True, warm=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(result.generated_html), {"editable/index.html", "plain/index.html", "sample/sample-member/index.html"})
        self.assertEqual(result.generated_data["content.json"], result.cold_generated_data["content.json"])
        contract = json.loads(result.generated_data["content.json"])
        self.assertEqual(contract["ids"], ["editable.md", "plain.md", "member"])
        self.assertEqual(contract["hrefs"], ["/editable", "/plain", "/sample/sample-member"])
        self.assertEqual(contract["termItems"], ["page:editable.md", "sample:member"])
        self.assertEqual(contract["sectionKinds"], ["text", "action"])
        self.assertEqual(contract["page"]["options"]["sidebar"], {"rail": False, "defaultOpen": False})
        self.assertNotIn("headerWidth", contract["page"]["options"])
        self.assertEqual(contract["page"]["options"]["parts"]["content"]["utilities"], [])
        self.assertNotIn("options", contract["plain"])
        self.assertEqual(contract["sample"]["options"], {"sidebar": None, "headerWidth": None})
        self.assertEqual(contract["page"]["published_at"], "2026-09-20T12:00:00.000Z")
        self.assertEqual([section["id"] for section in contract["page"]["sections"]], ["intro", "sample-action"])
        html = result.generated_html["editable/index.html"]
        self.assertIn("Literal &lt;strong&gt;content&lt;/strong&gt;.", html)
        self.assertIn('href="/sample/sample-member"', html)
        for path, count, rail in [("editable/index.html", 1, ["container-xl"]),
                                  ("plain/index.html", 1, ["container-xl", "py-4"]),
                                  ("sample/sample-member/index.html", 0, ["container-xl", "py-4"])]:
            with self.subTest(path=path):
                markup = native.Markup()
                markup.feed(result.generated_html[path])
                self.assertEqual(sum(tag == "main" for tag, _ in markup.elements), 1)
                self.assertEqual(sum(tag == "h1" for tag, _ in markup.elements), 1)
                self.assertEqual(sum(tag == "aside" for tag, _ in markup.elements), count)
                self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in markup.elements), 1)
                self.assertEqual(next(attrs["class"].split() for _, attrs in markup.elements if "data-page-container" in attrs), rail)
        metadata = result.generated_data["sections.json"]
        self.assertEqual(json.loads(metadata), {
            "text": {"label": "Text", "fields": {"heading": "text", "text": "text"}},
            "action": {"label": "Action", "fields": {"label": "text", "href": "link"}},
        })
        self.assertEqual(contract["page"]["taxonomies"], {"category": [{"collection": "category", "id": "child"}], "tag": []})
        self.assertNotIn("taxonomies", contract["plain"])

    def test_section_metadata_import_is_renderer_independent(self):
        result, _ = self.build(None, files=authored_files())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with tempfile.TemporaryDirectory(prefix="section-metadata-contract-") as directory:
            module = Path(directory) / "sections.mjs"
            module.write_text(result.generated_modules["section-metadata.js"], encoding="utf-8")
            imported = subprocess.run(["node", "--input-type=module", "-e", "const { default: metadata } = await import(process.argv[1]); console.log(JSON.stringify(metadata));", module.as_uri()], text=True, capture_output=True)
        self.assertEqual(imported.returncode, 0, imported.stdout + imported.stderr)
        self.assertEqual(json.loads(imported.stdout), json.loads(result.generated_data["sections.json"]))
        markup = native.Markup()
        markup.feed(result.generated_html["editable/index.html"])
        self.assertEqual([attrs["data-section-type"] for _, attrs in markup.elements if "data-section-type" in attrs], ["text", "action"])
        self.assertEqual(list(json.loads(imported.stdout)), ["text", "action"])

    def test_dormant_directory_source_cannot_bypass_integrity(self):
        # Neither host catch-all nor the remaining endpoints query this type.
        for mutation, diagnostic in [("missing", "sample missing JSON source directory"),
                                     ("malformed", "sample malformed JSON source"),
                                     ("stale", "sample member data differs from its current source")]:
            with self.subTest(mutation=mutation):
                files = authored_files()
                files.pop("src/pages/content.json.ts")
                files["src/pages/[...slug].astro"] = '---\nexport function getStaticPaths() { return []; }\n---\n<p>Unused Page route</p>'
                files["src/pages/sample/[...slug].astro"] = '---\nexport function getStaticPaths() { return []; }\n---\n<p>Unused Sample route</p>'
                if mutation == "missing":
                    files.pop("src/data/sample/member.json")
                elif mutation == "malformed":
                    files["src/data/sample/member.json"] = "{"
                    # Keep invalid source bytes out of the native glob; the Moo source gate must catch them.
                    self.replace_sample_loader(files, lambda loader: loader.replace('"*.json"', '"unused-*.json"'))
                else:
                    self.replace_sample_loader(files, lambda loader:
                        '{ name: "stale-sample", async load(context) { await ' + loader
                        + '.load(context); for (const [id, entry] of context.store.entries()) '
                        + 'context.store.set({ ...entry, id, digest: undefined, data: { '
                        + '...entry.data, title: "Stale title" } }); } }')
                result, _ = self.build(None, files=files)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(diagnostic, result.stdout + result.stderr)

    def replace_sample_loader(self, files, transform):
        pattern = (r'glob\(\{\s*base:\s*new URL\("\./data/sample/",\s*import\.meta\.url\),'
                   r'\s*pattern:\s*"\*\.json",\s*generateId:\s*jsonEntryId,?\s*\}\)')
        source = files["src/content.config.ts"]
        matches = list(re.finditer(pattern, source))
        self.assertEqual(len(matches), 1, "The sample loader mutation must select one declared source")
        match = matches[0]
        files["src/content.config.ts"] = source[:match.start()] + transform(match.group()) + source[match.end():]

    def test_semantic_file_edits_keep_identity_dates_and_unrelated_raw_preferences(self):
        files = authored_files()
        self.assertIn("src/data/sample/member.json", files)
        original = json.loads(files["src/data/sample/member.json"])
        edited = json.loads(json.dumps(original))
        edited["title"] = "Updated sample"
        edited["slug"] = "updated-sample"
        edited["taxonomies"]["category"] = ["root"]
        edited["sections"][0]["props"]["text"] = "Updated directory section."
        self.assertEqual(edited["options"], original["options"])
        self.assertEqual(edited["id"], original["id"])
        files["src/data/sample/member.json"] = json.dumps(edited)
        files["src/content/page/editable.md"] = files["src/content/page/editable.md"].replace("title: Editable Page", "title: Updated Page").replace("Editable Markdown body.", "Updated Markdown body.")
        # Reorder stable instances without rewriting their IDs or unrelated fields.
        first = "  - id: intro\n    type: text\n    props:\n      heading: Introduction\n      text: Literal <strong>content</strong>.\n"
        second = "  - id: sample-action\n    type: action\n    props:\n      label: Open sample\n      href: /sample/sample-member\n"
        self.assertIn(first + second, files["src/content/page/editable.md"])
        files["src/content/page/editable.md"] = files["src/content/page/editable.md"].replace(first + second, second + first)
        files["src/data/category/child.json"] = files["src/data/category/child.json"].replace("Child category", "Updated category")
        result, _ = self.build(None, files=files, check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        contract = json.loads(result.generated_data["content.json"])
        self.assertEqual(contract["ids"], ["editable.md", "plain.md", "member"])
        self.assertEqual(contract["hrefs"], ["/editable", "/plain", "/sample/updated-sample"])
        self.assertEqual(contract["sample"]["options"], {"sidebar": None, "headerWidth": None})
        self.assertEqual(contract["page"]["published_at"], "2026-09-20T12:00:00.000Z")
        self.assertEqual([section["id"] for section in contract["page"]["sections"]], ["sample-action", "intro"])
        self.assertEqual(contract["termItems"], ["page:editable.md"])
        self.assertIn("Updated Markdown body.", result.generated_html["editable/index.html"])
        self.assertIn("Updated directory section.", result.generated_html["sample/updated-sample/index.html"])
        self.assertIn("Updated category", json.dumps(contract["terms"]))

    def test_host_section_schema_rejects_duplicate_unknown_and_unsafe_instances(self):
        for mutation, diagnostic in [("duplicate", "Duplicate section id"), ("unknown", "Expected `type` to be"),
                                     ("extra", "Unrecognized key"), ("href", "Action href must be a safe link")]:
            with self.subTest(mutation=mutation):
                files = authored_files()
                entry = json.loads(files["src/data/sample/member.json"])
                if mutation == "duplicate":
                    entry["sections"].append(entry["sections"][0])
                elif mutation == "unknown":
                    entry["sections"][0]["type"] = "unknown"
                elif mutation == "extra":
                    entry["sections"][0]["props"]["extra"] = True
                else:
                    entry["sections"] = [{"id": "unsafe", "type": "action", "props": {"label": "Unsafe", "href": "javascript:alert(1)"}}]
                files["src/data/sample/member.json"] = json.dumps(entry)
                result, _ = self.build(None, files=files)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(diagnostic, result.stdout + result.stderr)
                self.assertIn("sample", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
