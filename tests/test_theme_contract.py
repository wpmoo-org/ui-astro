"""Compiled theme routes consume only the installed package's public exports."""

from pathlib import Path
import unittest

import test_view_structure as native


FIXTURE = Path(__file__).parent / "fixtures/theme"
EXPECTED_PAGES = frozenset({
    "index.html", "about/index.html", "contact/index.html", "guide/setup/index.html",
    "landing/index.html", "posts/index.html", "posts/announcement/index.html", "posts/ueber/index.html",
})


def require_theme_outputs(outputs):
    actual = set(outputs)
    missing = EXPECTED_PAGES - actual
    unexpected = actual - EXPECTED_PAGES
    if missing:
        raise ValueError(f"Theme output contract is missing canonical pages: {', '.join(sorted(missing))}")
    if unexpected:
        raise ValueError(f"Theme output contract has unexpected pages: {', '.join(sorted(unexpected))}")


def theme_files():
    return {str(path.relative_to(FIXTURE)): path.read_text(encoding="utf-8")
            for path in FIXTURE.rglob("*") if path.is_file()
            and path.name not in {"package.json", "package-lock.json"}}


class ThemeConsumer(unittest.TestCase):
    build = native.PublicComponentRendering.build

    @classmethod
    def setUpClass(cls):
        native.PublicComponentRendering.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        native.PublicComponentRendering.tearDownClass.__func__(cls)

    def test_theme_replacements_render_actual_pages_posts_and_native_astro(self):
        result, _ = self.build(None, files=theme_files(), check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        require_theme_outputs(result.generated_html)
        for path, html in result.generated_html.items():
            with self.subTest(path=path):
                elements = native.Markup()
                elements.feed(html)
                self.assertEqual(sum(tag == "h1" for tag, _ in elements.elements), 1)
                self.assertEqual(sum(tag == "main" for tag, _ in elements.elements), 1)
                self.assertEqual(sum(attrs.get("data-moo-document-owner") == "true" for _, attrs in elements.elements), 1)
                self.assertIn("Theme-owned Footer", html)
        self.assertIn("Authored About body.", result.generated_html["about/index.html"])
        self.assertIn("Theme-selected Loop", result.generated_html["posts/index.html"])
        self.assertIn('href="/posts/ueber"', result.generated_html["posts/index.html"])
        self.assertIn("Native Astro content.", result.generated_html["landing/index.html"])
        self.assertIn("page-about", result.generated_html["about/index.html"])
        self.assertIn("route-native-landing", result.generated_html["landing/index.html"])
        self.assertIn("0 errors", result.stdout + result.stderr)

    def test_theme_preferences_keep_shared_insets_and_per_entry_sidebar_overrides(self):
        result, _ = self.build(None, files=theme_files())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for path, sidebar_count, insets in [
            ("about/index.html", 1, ["py-3", "py-md-5"]),
            ("contact/index.html", 0, ["py-2"]),
            ("posts/index.html", 1, ["py-3", "py-md-5"]),
            ("posts/announcement/index.html", 0, ["py-3", "py-md-5"]),
            ("posts/ueber/index.html", 1, ["py-3", "py-md-5"]),
        ]:
            with self.subTest(path=path):
                markup = native.Markup()
                markup.feed(result.generated_html[path])
                self.assertEqual(sum(tag == "aside" for tag, _ in markup.elements), sidebar_count)
                rail = next(attrs for _, attrs in markup.elements if "data-page-container" in attrs)
                self.assertEqual(rail["class"].split(), ["container-xl", *insets])
        self.assertIn('lang="en"', result.generated_html["posts/index.html"])
        self.assertIn('href="/posts/ueber"', result.generated_html["posts/index.html"])
        self.assertIn('datetime="2026-09-28T01:30:00.000Z"', result.generated_html["posts/ueber/index.html"])

    def test_unreplaced_archive_remains_owned_by_the_active_plugin(self):
        files = theme_files()
        files["astro.config.mjs"] = files["astro.config.mjs"].replace('single: "host", archive: "host"', 'single: "host"')
        del files["src/pages/posts/index.astro"]
        result, _ = self.build(None, files=files, check=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("posts/index.html", result.generated_html)
        self.assertIn('href="/posts/ueber"', result.generated_html["posts/index.html"])
        self.assertIn("Theme-owned Footer", result.generated_html["posts/ueber/index.html"])

    def test_fixture_output_contract_rejects_a_published_page_dropped_by_the_host(self):
        # Native i18n is disabled here; the fixture ledger owns this completeness check.
        files = theme_files()
        route = "src/pages/[...slug].astro"
        self.assertEqual(files[route].count('path.props.entry.id !== "about.md"'), 1)
        files[route] = files[route].replace(
            'path.props.entry.id !== "about.md"',
            'path.props.entry.id !== "about.md" && path.props.entry.id !== "guide/setup.md"',
            1,
        )
        result, _ = self.build(None, files=files)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with self.assertRaisesRegex(ValueError, "missing canonical pages: guide/setup/index.html"):
            require_theme_outputs(result.generated_html)
        self.assertNotIn("guide/setup/index.html", result.generated_html)
        self.assertIn("contact/index.html", result.generated_html)


if __name__ == "__main__":
    unittest.main()
