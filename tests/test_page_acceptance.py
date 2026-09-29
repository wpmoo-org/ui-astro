"""Positive browser contracts for the accepted Page examples on port 4322."""

import os
import unittest
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class AcceptedPageExamples(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 900})
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def tearDown(self):
        self.assertEqual(self.errors, [])
        self.context.close()

    def open_page(self, path):
        response = self.page.goto(urljoin(BASE_URL, path), wait_until="domcontentloaded")
        self.assertEqual(response.status, 200)
        self.page.locator('[data-moo-document-owner][data-moo-state="ready"]').wait_for()
        self.assertEqual(self.page.locator('[data-moo-document-owner]').count(), 1)
        self.assertEqual(self.page.locator('main#main-content > [data-page-container]').count(), 1)
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))

    def test_one_page_override_omits_sidebar_without_affecting_its_content(self):
        self.open_page("iletisim")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Contact"])
        self.assertEqual(self.page.locator("main article.page.page-contact").count(), 1)
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="sidebar"]').count(), 0)
        self.assertEqual(self.page.locator('[data-sidebar-trigger]').count(), 0)
        self.assertIn("Contact page body.", self.page.locator("main").inner_text())

    def test_other_page_inherits_sidebar_and_uses_its_canonical_links(self):
        self.open_page("kilavuz/kurulum")
        self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-state-ready]').wait_for()
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Setup guide"])
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="sidebar"]').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="sidebar"] a[aria-current="page"]').get_attribute("href"), "/kilavuz/kurulum")
        self.assertEqual(self.page.locator('[data-sidebar-trigger]').get_attribute("aria-controls"), "moo-site-sidebar")
        self.assertEqual(self.page.locator('[data-sidebar-trigger]').get_attribute("aria-expanded"), "true")
        self.assertEqual(self.page.locator('footer a').get_attribute("href"), "/iletisim")

    def test_narrow_page_sidebar_opens_by_keyboard_and_escape_returns_focus(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.open_page("kilavuz/kurulum")
        trigger = self.page.locator('[data-sidebar-trigger]')
        trigger.focus()
        self.assertTrue(trigger.evaluate("element => element.matches(':focus-visible')"))
        self.page.keyboard.press("Enter")
        self.page.locator('[data-slot="sidebar"].show').wait_for()
        self.assertEqual(trigger.get_attribute("aria-expanded"), "true")
        self.assertEqual(self.page.locator('[data-slot="sidebar"]').get_attribute("aria-modal"), "true")
        self.page.keyboard.press("Escape")
        self.page.locator('[data-slot="sidebar"].show').wait_for(state="hidden")
        self.assertTrue(trigger.evaluate("element => document.activeElement === element"))
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))

    def test_dark_rtl_and_archive_heading_links_use_the_existing_page_shell(self):
        self.context.add_init_script("localStorage.setItem('moo:theme', 'dark'); localStorage.setItem('moo:direction', 'rtl')")
        self.open_page("preview/page-archive")
        self.assertEqual(self.page.locator("html").get_attribute("dir"), "rtl")
        self.assertEqual(self.page.locator('.moo-ui').get_attribute("data-bs-theme"), "dark")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Pages"])
        self.assertEqual(self.page.locator("main h2 a").all_text_contents(), ["Contact", "Setup guide"])
        self.assertEqual(self.page.locator("main h2 a").evaluate_all("links => links.map(link => link.getAttribute('href'))"), ["/iletisim", "/kilavuz/kurulum"])
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="sidebar"]').count(), 0)


if __name__ == "__main__":
    unittest.main()
