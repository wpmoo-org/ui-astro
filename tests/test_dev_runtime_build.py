"""The existing 4322 server must keep serving content and runtime after a build."""
import os
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import unittest
from urllib.request import urlopen
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit


ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322").rstrip("/")


class ClientModuleScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == "script" and attributes.get("type") == "module" and attributes.get("src"):
            self.urls.append(attributes["src"])


def import_paths(source):
    return [match[1] for match in re.findall(r'''(?:\bfrom\s*|\bimport\s*)(['"])([^'"\n]+)\1''', source)]


class DevRuntimeBuild(unittest.TestCase):
    def source(self, url):
        with urlopen(url, timeout=15) as response:
            return response.read().decode("utf-8")

    def runtime_urls(self):
        scripts = ClientModuleScripts()
        scripts.feed(self.source(f"{BASE}/"))
        facades = {}
        for script in scripts.urls:
            module = urljoin(f"{BASE}/", script)
            if urlsplit(module).path == "/@vite/client":
                continue
            for path in import_paths(self.source(module)):
                for name in ("bootstrap", "moo-ui"):
                    if urlsplit(path).path.endswith(f"/runtime/{name}.js"):
                        facades[name] = urljoin(module, path)
            if len(facades) == 2:
                break
        self.assertEqual(set(facades), {"bootstrap", "moo-ui"},
                         "client modules must import both bootstrap and moo-ui runtime facades")
        urls = set()
        for name in ("bootstrap", "moo-ui"):
            facade = facades[name]
            paths = [urljoin(facade, path) for path in import_paths(self.source(facade))
                     if "/node_modules/" in urlsplit(path).path or urlsplit(path).path.startswith("/@id/")]
            self.assertTrue(paths, f"{name} must resolve its public package runtime")
            urls.update(paths)
        return urls

    def assert_runtime_served(self, urls):
        for url in sorted(urls):
            try:
                with urlopen(url, timeout=15) as response:
                    self.assertEqual(response.status, 200, url)
                    self.assertTrue(response.read(), url)
            except HTTPError as error:
                self.fail(f"{url}: HTTP {error.code} {error.reason}")

    def assert_selected_content_served(self):
        for path, title in (
            ("/guide/setup", "Setup guide"),
            ("/posts", "Posts"),
            ("/posts/announcement", "A published announcement"),
            ("/posts/layout-options", "One Post with a Sidebar"),
        ):
            try:
                with urlopen(f"{BASE}{path}", timeout=15) as response:
                    self.assertEqual(response.status, 200, path)
                    source = response.read().decode("utf-8")
                self.assertIn(f"<title>{title}</title>", source, path)
            except HTTPError as error:
                self.fail(f"{path}: HTTP {error.code} {error.reason}")

    def test_build_preserves_warm_dev_runtime_dependencies(self):
        urls = self.runtime_urls()
        self.assert_runtime_served(urls)
        self.assert_selected_content_served()
        result = subprocess.run(
            ["npm", "run", "build"], cwd=ROOT, text=True,
            capture_output=True, timeout=120,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_runtime_served(urls)
        self.assert_runtime_served(self.runtime_urls())
        self.assert_selected_content_served()


if __name__ == "__main__":
    unittest.main()
