"""A host-defined JSON-directory content type uses the public Astro loader."""

from pathlib import Path
import json
import shutil
import subprocess
import tempfile
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

    def test_native_json_array_retains_legacy_id_and_independent_slug(self):
        with tempfile.TemporaryDirectory(prefix=".json-array-id-", dir=ROOT / "tests/fixtures") as directory:
            fixture = Path(directory)
            shutil.copytree(
                ROOT / "tests/fixtures/json-file", fixture, dirs_exist_ok=True,
                ignore=shutil.ignore_patterns("dist", ".astro", "node_modules", ".cache"),
            )
            (fixture / "src/content/team.json").write_text(json.dumps([
                {"id": "cng_1", "slug": "member", "title": "Member", "status": "publish"},
            ]) + "\n")
            config = fixture / "src/content.config.mjs"
            config.write_text(config.read_text().replace("title: z.string(),", "title: z.string(), slug: z.string(),"))
            (fixture / "src/pages/records.json.ts").write_text(
                'import { getCollection } from "astro:content";\n'
                'export async function GET() {\n'
                '  return Response.json((await getCollection("team")).map(entry => ({\n'
                '    id: entry.id, slug: entry.data.slug, filePath: entry.filePath,\n'
                '  })));\n'
                '}\n'
            )
            result = subprocess.run([str(ASTRO), "build"], cwd=fixture, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(json.loads((fixture / "dist/records.json").read_text()), [
                {"id": "cng_1", "slug": "member", "filePath": "src/content/team.json"},
            ])
            self.assertFalse((fixture / "dist/__moo_content_integrity").exists())


if __name__ == "__main__":
    unittest.main()
