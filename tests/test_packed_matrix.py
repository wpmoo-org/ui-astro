"""Read the real all-profile controller output; no borrowed dependency tree."""

import hashlib
import json
from pathlib import Path
import sys
import unittest


PROOF_ROOT = Path(sys.argv.pop(1)).resolve() if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else None


class PackedMatrix(unittest.TestCase):
    def test_compiled_namespaces_and_native_source_provenance(self):
        if PROOF_ROOT is None:
            self.skipTest("Pass the actual all-profile proof directory explicitly")
        namespace_path = PROOF_ROOT / "consumer/dist/namespaces.json"
        self.assertTrue(namespace_path.is_file(), "Public JS namespaces need actual compiled SSR evidence")
        namespaces = json.loads(namespace_path.read_text())
        self.assertEqual(namespaces["root"], ["default"])
        self.assertEqual(namespaces["config"], ["defineSite", "formatDate", "getEntryClasses", "getPageClasses", "layoutSchema", "normalizeSlug", "resolvePageOptions", "resolveParts"])
        self.assertEqual(namespaces["context"], ["getEntryHref", "getRootPaths", "getSiteContext", "getSiteNavigation", "validateSiteContent"])
        self.assertEqual(namespaces["i18n"], ["getLanguageLinks", "getLocaleHref", "getRouteLocale"])
        self.assertEqual(namespaces["seo"], ["resolveSeoMetadata"])
        self.assertEqual(namespaces["notFound"], ["getNotFoundOptions"])
        evidence_path = PROOF_ROOT / "consumer/dist/content-contract.json"
        self.assertTrue(evidence_path.is_file(), "Native loaded IDs and file paths must be retained")
        evidence = json.loads(evidence_path.read_text())
        page = next(value for value in evidence["types"] if value["id"] == "page")
        entries = {value["id"]: value for value in page["entries"]}
        self.assertEqual(entries["contact.md"]["filePath"], "src/content/page/contact.md")
        self.assertEqual(entries["contact.md"]["href"], "/contact")
        self.assertEqual(entries["guide/setup.md"]["filePath"], "src/content/page/guide/setup.md")
        self.assertIsNone(entries["draft.md"]["href"])

    def test_all_profiles_share_one_archive_and_real_isolated_install(self):
        if PROOF_ROOT is None:
            self.skipTest("Pass the actual all-profile proof directory explicitly")
        proof = json.loads((PROOF_ROOT / "proof.json").read_text())
        self.assertEqual(proof["schema_version"], 2, "The legacy single consumer is not the matrix")
        self.assertEqual(proof["selection"], "all")
        expected_counts = {"default": 4, "theme": 9, "ui-only": 2, "page-only": 2,
                           "post-only": 3, "mdx": 7, "external-plugin": 4, "taxonomy": 22,
                           "external-taxonomy": 14, "content-editing": 4, "not-found": 4, "not-found-host": 4}
        self.assertEqual(set(proof["profiles"]), set(expected_counts))
        archive = proof["artifacts"]["@wpmoo/astro"]
        archive_hash = hashlib.sha256((PROOF_ROOT / archive["filename"]).read_bytes()).hexdigest()
        self.assertEqual(archive["sha256"], archive_hash)
        for name, expected_count in expected_counts.items():
            with self.subTest(profile=name):
                profile = proof["profiles"][name]
                self.assertEqual(profile["archive_sha256"], archive_hash)
                self.assertEqual(len(profile["html"]), expected_count)
                self.assertEqual(profile["authored_before"], profile["authored_after"])
                self.assertEqual(profile["host_astro"], "7.3.3")
                self.assertEqual(profile["mdx_installed"], name == "mdx")
                for path, digest in profile["html"].items():
                    self.assertEqual(hashlib.sha256((PROOF_ROOT / profile["directory"] / "dist" / path).read_bytes()).hexdigest(), digest)
                for step in ("install", "check", "build"):
                    command = profile["steps"][step]
                    self.assertEqual(command["exit_code"], 0)
                    self.assertTrue((PROOF_ROOT / profile["directory"] / command["log"]).is_file())
                self.assertEqual(profile["steps"]["install"]["args"], ["ci", "--offline", "--strict-peer-deps", "--audit=false", "--fund=false"])
        for phase in ("before", "after"):
            actual = json.loads((PROOF_ROOT / f"container-{phase}.json").read_text())[0]
            self.assertEqual(actual["HostConfig"]["NetworkMode"], "none")
            self.assertFalse(actual["HostConfig"].get("PortBindings"))
            self.assertEqual({mount["Destination"] for mount in actual["Mounts"]}, {"/proof", "/cache"})
            self.assertFalse(next(mount for mount in actual["Mounts"] if mount["Destination"] == "/cache")["RW"])
        self.assertEqual(actual["State"]["ExitCode"], 0)


if __name__ == "__main__":
    unittest.main()
