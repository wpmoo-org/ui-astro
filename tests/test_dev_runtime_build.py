"""The existing 4322 server must keep serving its runtime after a build."""
import os
from pathlib import Path
import re
import subprocess
import unittest
from urllib.request import urlopen
from urllib.error import HTTPError


ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322").rstrip("/")


class DevRuntimeBuild(unittest.TestCase):
    def runtime_urls(self):
        urls = set()
        for name in ("bootstrap", "moo-ui"):
            with urlopen(f"{BASE}/src/runtime/{name}.js", timeout=15) as response:
                source = response.read().decode("utf-8")
            paths = re.findall(r'"(/node_modules/[^"\n]+)"', source)
            self.assertTrue(paths, f"{name} must resolve its public package runtime")
            urls.update(f"{BASE}{path}" for path in paths)
        return urls

    def assert_runtime_served(self, urls):
        for url in sorted(urls):
            try:
                with urlopen(url, timeout=15) as response:
                    self.assertEqual(response.status, 200, url)
                    self.assertTrue(response.read(), url)
            except HTTPError as error:
                self.fail(f"{url}: HTTP {error.code} {error.reason}")

    def test_build_preserves_warm_dev_runtime_dependencies(self):
        urls = self.runtime_urls()
        self.assert_runtime_served(urls)
        result = subprocess.run(
            ["npm", "run", "build"], cwd=ROOT, text=True,
            capture_output=True, timeout=120,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_runtime_served(urls)
        self.assert_runtime_served(self.runtime_urls())


if __name__ == "__main__":
    unittest.main()
