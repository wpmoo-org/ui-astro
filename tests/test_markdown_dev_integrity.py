"""Warm native Markdown edits must never serve the loader's stale published data.

Run in an isolated container with no published ports; its dev server uses 4322.
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

import test_view_structure as render_contract

ROOT = render_contract.ROOT


class NativeMarkdownDevIntegrity(unittest.TestCase):
    def test_invalid_warm_edit_blocks_every_route_until_native_content_is_current(self):
        render_contract.PublicComponentRendering.setUpClass()
        try:
            with tempfile.TemporaryDirectory(prefix="astro-md-dev-contract-") as directory:
                host = Path(directory)
                (host / "src/pages").mkdir(parents=True)
                (host / "src/content/page").mkdir(parents=True)
                (host / "node_modules/@wpmoo").mkdir(parents=True)
                for name in ("astro", "bootstrap"):
                    (host / "node_modules" / name).symlink_to(ROOT / "node_modules" / name, target_is_directory=True)
                (host / "node_modules/@wpmoo/ui").symlink_to(ROOT / "node_modules/@wpmoo/ui", target_is_directory=True)
                shutil.copytree(render_contract.PublicComponentRendering.package_root, host / "node_modules/@wpmoo/astro")
                (host / "package.json").write_text(json.dumps({"name": "native-md-dev-contract", "private": True, "type": "module"}))
                (host / "astro.config.mjs").write_text('''import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
export default defineConfig({ integrations: [moo({ plugins: [page()] })] });
''')
                (host / "src/content.config.mjs").write_text('''import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
export const collections = { page: defineCollection({
  loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }),
  schema: pageSchema,
}) };
''')
                (host / "src/pages/state.json.ts").write_text('''import { getCollection } from "astro:content";
export const GET = async () => Response.json(await getCollection("page"));
''')
                source = host / "src/content/page/contact.md"
                source.write_text("---\ntitle: Original\nstatus: publish\n---\nOriginal body.\n")
                log_path = host / "dev.log"
                with log_path.open("w") as log:
                    process = subprocess.Popen([str(ROOT / "node_modules/.bin/astro"), "dev", "--host", "127.0.0.1", "--port", "4322"],
                                               cwd=host, stdout=log, stderr=subprocess.STDOUT)
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
                                if predicate():
                                    return
                            except (URLError, TimeoutError):
                                pass
                            if process.poll() is not None:
                                self.fail(log_path.read_text())
                            time.sleep(.05)
                        self.fail("Native dev condition did not converge:\n" + log_path.read_text()[-12000:])

                    try:
                        wait_for(lambda: request("/contact")[0] == 200)
                        self.assertIn("Original body.", request("/contact")[1])
                        source.write_text("---\ntitle: []\nstatus: draft\n---\nInvalid draft.\n")
                        wait_for(lambda: "Failed to reload contact.md" in log_path.read_text())
                        for path in ("/contact", "/state.json"):
                            status, body = request(path)
                            self.assertEqual(status, 500, body)
                        self.assertIn("page contact.md current Markdown source fails schema at title", log_path.read_text())
                        source.write_text("---\ntitle: Current draft\nstatus: draft\n---\nCurrent draft body.\n")
                        wait_for(lambda: request("/contact")[0] == 404 and request("/state.json")[0] == 200)
                        entries = json.loads(request("/state.json")[1])
                        self.assertEqual(entries[0]["data"]["status"], "draft")
                        self.assertEqual(entries[0]["body"], "Current draft body.")
                        source.write_text("---\ntitle: Current publish\nstatus: publish\n---\nCurrent published body.\n")
                        wait_for(lambda: request("/contact")[0] == 200 and "Current published body." in request("/contact")[1])
                        self.assertIn("Current publish", request("/contact")[1])
                    finally:
                        process.terminate()
                        process.wait(timeout=10)
        finally:
            render_contract.PublicComponentRendering.tearDownClass()


if __name__ == "__main__":
    unittest.main()
