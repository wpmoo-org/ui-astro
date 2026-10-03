"""Native Post collections must converge after editor save/format bursts."""

import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

import test_view_structure as native


class ContentSaveBurst(unittest.TestCase):
    def test_final_post_save_reaches_native_queries_and_routes_without_restart(self):
        native.PublicComponentRendering.setUpClass()
        try:
            with tempfile.TemporaryDirectory(prefix="astro-save-burst-") as directory:
                host = Path(directory)
                (host / "src/pages").mkdir(parents=True)
                (host / "src/content/post").mkdir(parents=True)
                (host / "node_modules/@wpmoo").mkdir(parents=True)
                for name in ("astro", "bootstrap"):
                    (host / "node_modules" / name).symlink_to(
                        native.ROOT / "node_modules" / name, target_is_directory=True)
                (host / "node_modules/@wpmoo/ui").symlink_to(
                    native.ROOT / "node_modules/@wpmoo/ui", target_is_directory=True)
                shutil.copytree(native.PublicComponentRendering.package_root,
                                host / "node_modules/@wpmoo/astro")
                (host / "package.json").write_text(json.dumps({
                    "name": "content-save-burst", "private": True, "type": "module"}))
                (host / "astro.config.mjs").write_text('''import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { post } from "@wpmoo/astro/plugins/post";
export default defineConfig({ integrations: [moo({ plugins: [post()] })] });
''')
                (host / "src/content.config.mjs").write_text('''import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { postSchema } from "@wpmoo/astro/plugins/post/content";
export const collections = { post: defineCollection({
  loader: glob({ base: new URL("./content/post/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }),
  schema: postSchema,
}) };
''')
                (host / "src/pages/state.json.ts").write_text('''import { getCollection } from "astro:content";
export const GET = async () => Response.json(await getCollection("post"));
''')
                source = host / "src/content/post/announcement.md"

                def content(title, body):
                    return f"---\ntitle: {title}\nstatus: publish\npublished_at: '2026-10-03T12:00:00Z'\n---\n{body}\n"

                source.write_text(content("Original", "Original body."))
                with socket.socket() as listener:
                    listener.bind(("127.0.0.1", 0))
                    port = listener.getsockname()[1]
                log_path = host / "dev.log"
                with log_path.open("w") as log:
                    process = subprocess.Popen(
                        [str(native.ROOT / "node_modules/.bin/astro"), "dev",
                         "--host", "127.0.0.1", "--port", str(port)],
                        cwd=host, stdout=log, stderr=subprocess.STDOUT)

                    def request(path):
                        try:
                            with urlopen(f"http://127.0.0.1:{port}{path}", timeout=2) as response:
                                return response.status, response.read().decode()
                        except HTTPError as response:
                            return response.code, response.read().decode()

                    def wait_for(predicate, label):
                        deadline = time.monotonic() + 12
                        while time.monotonic() < deadline:
                            try:
                                if predicate():
                                    return
                            except (URLError, TimeoutError):
                                pass
                            if process.poll() is not None:
                                self.fail(log_path.read_text())
                            time.sleep(.05)
                        self.fail(f"{label} did not converge:\n{log_path.read_text()[-12000:]}")

                    try:
                        wait_for(lambda: request("/posts/announcement")[0] == 200, "Initial Post")
                        for atomic in (False, True):
                            with self.subTest(atomic=atomic):
                                label = "Atomic" if atomic else "In-place"

                                def save(text):
                                    if atomic:
                                        temporary = source.with_name(".announcement.tmp")
                                        temporary.write_text(text)
                                        temporary.replace(source)
                                    else:
                                        source.write_text(text)

                                save(content(f"{label} first", "First body."))
                                # Real editor save + format-on-save can produce two writes
                                # inside the native watcher's 50ms change coalescing window.
                                time.sleep(.03)
                                save(content(f"{label} final", "Final saved body."))
                                wait_for(lambda: request("/state.json")[0] == 200
                                         and f"{label} final" in request("/state.json")[1], label)
                                entries = json.loads(request("/state.json")[1])
                                self.assertEqual(entries[0]["body"], "Final saved body.")
                                self.assertEqual(entries[0]["data"]["title"], f"{label} final")
                                status, html = request("/posts/announcement")
                                self.assertEqual(status, 200)
                                self.assertIn("Final saved body.", html)
                                self.assertIn(f"{label} final", html)
                                self.assertEqual(request("/posts")[0], 200)
                                self.assertIsNone(process.poll(), "The same dev process must stay alive")
                    finally:
                        process.terminate()
                        process.wait(timeout=10)
        finally:
            native.PublicComponentRendering.tearDownClass()


if __name__ == "__main__":
    unittest.main()
