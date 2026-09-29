"""A selected Page collection must not be treated as a valid empty source."""

from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/missing-page-collection"
ASTRO = ROOT / "node_modules/.bin/astro"


class MissingCollectionBuild(unittest.TestCase):
    def test_selected_missing_page_collection_stops_the_native_build(self):
        result = subprocess.run([str(ASTRO), "build"], cwd=FIXTURE, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("page collection", result.stdout + result.stderr)

    def test_same_id_from_wrong_native_source_fails_file_path_provenance(self):
        fixture = ROOT / "tests/fixtures/wrong-page-source"
        result = subprocess.run([str(ASTRO), "build"], cwd=fixture, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("page contact.md filePath", result.stdout + result.stderr)

    def test_native_default_id_does_not_impersonate_source_filename_id(self):
        fixture = ROOT / "tests/fixtures/wrong-page-id"
        result = subprocess.run([str(ASTRO), "build"], cwd=fixture, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("page loaded contact is undeclared", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
