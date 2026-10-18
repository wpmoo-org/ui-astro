"""Positive browser contracts for the 404 appearance accepted on 2026-10-18.

Run against a development server with ASTRO_BASE_URL; static hosting must
separately configure locale-specific HTTP 404 selection.
"""

import os
import unittest
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/").rstrip("/") + "/"


class AcceptedNotFound(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def test_centered_responsive_number_and_localized_recovery(self):
        for locale, prefix in (("en", ""), ("de", "de/")):
            for width, scale in ((390, 6), (1440, 8)):
                for theme in ("light", "dark"):
                    with self.subTest(locale=locale, width=width, theme=theme):
                        context = self.browser.new_context(
                            viewport={"width": width, "height": 900}
                        )
                        try:
                            context.add_init_script(
                                f"localStorage.setItem('moo:theme', '{theme}');"
                            )
                            page = context.new_page()
                            errors = []
                            page.on("pageerror", lambda error: errors.append(str(error)))
                            target = urljoin(BASE_URL, prefix + "missing-404-acceptance/")
                            response = page.goto(target, wait_until="domcontentloaded")
                            self.assertEqual(response.status, 404)
                            self.assertEqual(page.url, target)
                            expect(page.locator("html")).to_have_attribute("lang", locale)
                            owner = page.locator('[data-moo-document-owner][data-moo-state="ready"]')
                            expect(owner).to_have_attribute("data-bs-theme", theme)
                            view = page.locator("main [data-not-found]")
                            expect(view).to_be_visible()
                            expect(view.locator("h1")).to_have_count(1)
                            number = view.locator("[data-not-found-code]")
                            expect(number).to_have_text("404")
                            typography = number.evaluate("""element => {
                                const style = getComputedStyle(element);
                                return {
                                    size: parseFloat(style.fontSize),
                                    root: parseFloat(getComputedStyle(document.documentElement).fontSize),
                                    weight: style.fontWeight,
                                    align: style.textAlign,
                                };
                            }""")
                            self.assertAlmostEqual(typography["size"] / typography["root"], scale)
                            self.assertEqual(typography["weight"], "600")
                            self.assertEqual(typography["align"], "center")
                            recovery = view.locator("a[href]")
                            expect(recovery).to_have_count(1)
                            expect(recovery).to_be_visible()
                            box = view.bounding_box()
                            action = recovery.bounding_box()
                            self.assertAlmostEqual(
                                action["x"] + action["width"] / 2,
                                box["x"] + box["width"] / 2,
                                delta=1,
                            )
                            self.assertLess(action["width"], box["width"] * 0.8)
                            expect(recovery.locator("svg path")).to_have_count(1)
                            self.assertFalse(page.evaluate(
                                "document.documentElement.scrollWidth > innerWidth"
                            ))
                            home = urljoin(BASE_URL, prefix)
                            recovery.click()
                            page.wait_for_url(
                                lambda url: urlsplit(url).path.rstrip("/")
                                == urlsplit(home).path.rstrip("/")
                            )
                            expect(page.locator("html")).to_have_attribute("lang", locale)
                            self.assertEqual(errors, [])
                        finally:
                            context.close()


if __name__ == "__main__":
    unittest.main()
