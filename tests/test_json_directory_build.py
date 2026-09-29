"""A host-defined JSON-directory content type uses the public Astro loader."""

from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
ASTRO = ROOT / "node_modules/.bin/astro"
FIXTURE = ROOT / "tests/fixtures/json-directory"


class JsonDirectoryBuild(unittest.TestCase):
    def test_host_collection_builds_through_the_packed_private_integrity_probe(self):
        result = subprocess.run([str(ASTRO), "build"], cwd=FIXTURE, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse((FIXTURE / "dist/__moo_content_integrity").exists())

    def test_native_json_file_loader_builds_through_the_same_integrity_probe(self):
        fixture = ROOT / "tests/fixtures/json-file"
        result = subprocess.run([str(ASTRO), "build"], cwd=fixture, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse((fixture / "dist/__moo_content_integrity").exists())


if __name__ == "__main__":
    unittest.main()
