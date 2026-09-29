"""Resolved Astro routes must preserve the declared integration or host owner."""

from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
ASTRO = ROOT / "node_modules/.bin/astro"


class ResolvedRouteOwnership(unittest.TestCase):
    def build(self, name):
        return subprocess.run(
            [str(ASTRO), "build"], cwd=ROOT / "tests/fixtures" / name,
            text=True, capture_output=True,
        )

    def test_a_native_catchall_cannot_silently_shadow_the_page_plugin(self):
        result = self.build("route-conflict")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("moo page route /[...slug] has multiple resolved owners", result.stdout + result.stderr)

    def test_an_explicit_host_owned_page_route_builds_without_an_injected_duplicate(self):
        result = self.build("host-owned-route")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_active_plugin_namespace_cannot_be_shadowed_by_a_page_entry(self):
        result = self.build("page-namespace-conflict")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        output = result.stdout + result.stderr
        self.assertIn("Page entry sample/contact.md maps to /sample/contact inside reserved namespace /sample", output)
        self.assertIn("at getPagePaths", output)

    def test_neighboring_page_path_remains_valid_beside_a_plugin_namespace(self):
        result = self.build("page-namespace-neighbor")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((ROOT / "tests/fixtures/page-namespace-neighbor/dist/sample-other/contact/index.html").exists())


if __name__ == "__main__":
    unittest.main()
