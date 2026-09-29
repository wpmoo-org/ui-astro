"""Accepted Turkish empty states in the existing Moo Page shell on port 4322."""

import os
import unittest
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class AcceptedEmptyStates(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def test_localized_empty_states_fit_the_moo_shell_at_both_widths(self):
        for width, height in ((1440, 900), (390, 844)):
            with self.subTest(width=width):
                page = self.browser.new_page(viewport={"width": width, "height": height})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                response = page.goto(urljoin(BASE_URL, "preview/i18n-empty"), wait_until="domcontentloaded")
                self.assertEqual(response.status, 200)
                page.locator('[data-moo-document-owner][data-moo-state="ready"]').wait_for()
                self.assertEqual(page.locator("html").get_attribute("lang"), "tr")
                self.assertEqual(page.locator("main h1").all_text_contents(), ["Boş durumlar"])
                self.assertEqual(page.locator("main h2").all_text_contents(), ["Öğeler", "Sayfalar"])
                self.assertEqual(page.locator("main p.text-body-secondary").all_text_contents(), ["Henüz öğe yok.", "Henüz sayfa yok."])
                self.assertEqual(page.locator('header nav[aria-label="Gezinti yolu"]').count(), 1)
                self.assertEqual(page.locator('[data-moo-document-owner]').count(), 1)
                self.assertEqual(page.locator('main#main-content > [data-page-container]').count(), 1)
                self.assertFalse(page.evaluate("document.documentElement.scrollWidth > innerWidth"))
                self.assertEqual(errors, [])
                page.close()


if __name__ == "__main__":
    unittest.main()
