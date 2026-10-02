"""Warm native term edits are guarded on both host pages and query endpoints.

Run in an isolated container with no published ports; it uses internal port 4322.
"""

import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import test_view_structure as native


class NativeTaxonomyDevIntegrity(unittest.TestCase):
    def test_valid_invalid_restored_terms_never_serve_stale_collection_data(self):
        native.PublicComponentRendering.setUpClass()
        try:
            with tempfile.TemporaryDirectory(prefix="astro-term-dev-contract-") as directory:
                host = Path(directory)
                (host / "src/pages").mkdir(parents=True)
                (host / "src/data").mkdir()
                (host / "node_modules/@wpmoo").mkdir(parents=True)
                for name in ("astro", "bootstrap"):
                    (host / "node_modules" / name).symlink_to(native.ROOT / "node_modules" / name, target_is_directory=True)
                (host / "node_modules/@wpmoo/ui").symlink_to(native.ROOT / "node_modules/@wpmoo/ui", target_is_directory=True)
                shutil.copytree(native.PublicComponentRendering.package_root, host / "node_modules/@wpmoo/astro")
                (host / "package.json").write_text(json.dumps({"name": "native-term-dev-contract", "private": True, "type": "module"}))
                (host / "astro.config.mjs").write_text('''import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { defineTaxonomy } from "@wpmoo/astro/taxonomies";
export default defineConfig({ integrations: [moo({ plugins: [], taxonomies: [defineTaxonomy({ id: "tag", label: "Tags", source: new URL("./src/data/tag.json", import.meta.url) })] })] });
''')
                (host / "src/content.config.mjs").write_text('''import { defineCollection } from "astro:content";
import { file } from "astro/loaders";
import { termSchema } from "@wpmoo/astro/taxonomies/content";
export const collections = { tag: defineCollection({ loader: file("src/data/tag.json"), schema: termSchema }) };
''')
                (host / "src/pages/index.astro").write_text('<p>Host-owned page.</p>')
                (host / "src/pages/state.json.ts").write_text('import { getTaxonomyTerms } from "@wpmoo/astro/taxonomies/queries"; export const GET = async () => Response.json(await getTaxonomyTerms("tag"));')
                source = host / "src/data/tag.json"
                source.write_text(json.dumps([{"id": "astro", "name": "Original", "slug": "astro"}]))
                log_path = host / "dev.log"
                with log_path.open("w") as log:
                    process = subprocess.Popen([str(native.ROOT / "node_modules/.bin/astro"), "dev", "--host", "127.0.0.1", "--port", "4322"], cwd=host, stdout=log, stderr=subprocess.STDOUT)

                    def request(path):
                        try:
                            with urlopen(Request("http://127.0.0.1:4322" + path, headers={"Accept": "text/html"}), timeout=2) as response:
                                return response.status, response.read().decode()
                        except HTTPError as response:
                            return response.code, response.read().decode()

                    def wait_for(predicate):
                        deadline = time.monotonic() + 20
                        while time.monotonic() < deadline:
                            try:
                                if predicate(): return
                            except (URLError, TimeoutError): pass
                            if process.poll() is not None: self.fail(log_path.read_text())
                            time.sleep(.05)
                        self.fail("Native term edit did not converge:\n" + log_path.read_text()[-12000:])

                    try:
                        wait_for(lambda: request("/state.json")[0] == 200)
                        self.assertEqual(json.loads(request("/state.json")[1])[0]["name"], "Original")
                        source.write_text("[")
                        wait_for(lambda: request("/")[0] == 500)
                        self.assertEqual(request("/state.json")[0], 500)
                        self.assertIn("tag malformed JSON source", log_path.read_text())
                        wait_for(lambda: "Error reading data from src/data/tag.json" in log_path.read_text())
                        # Distinct editor saves must exceed Chokidar's 50ms change coalescing window.
                        time.sleep(.2)
                        source.write_text(json.dumps([{"id": "astro", "name": "Restored", "slug": "astro"}]))
                        wait_for(lambda: request("/state.json")[0] == 200 and "Restored" in request("/state.json")[1])
                        self.assertEqual(request("/")[0], 200)
                        self.assertEqual(json.loads(request("/state.json")[1])[0]["name"], "Restored")
                    finally:
                        process.terminate()
                        process.wait(timeout=10)
        finally:
            native.PublicComponentRendering.tearDownClass()


if __name__ == "__main__": unittest.main()
