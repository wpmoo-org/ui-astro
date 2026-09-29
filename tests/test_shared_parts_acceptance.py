"""Positive browser contracts for the accepted Single and Archive previews."""

import os
import unittest
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class AcceptedSharedParts(unittest.TestCase):
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

    def open_preview(self, path):
        response = self.page.goto(urljoin(BASE_URL, path), wait_until="domcontentloaded")
        self.assertEqual(response.status, 200)
        self.page.locator('[data-moo-document-owner][data-moo-state="ready"]').wait_for()
        self.assertEqual(self.page.locator('[data-moo-document-owner]').count(), 1)
        self.assertEqual(self.page.locator("main#main-content > [data-page-container]").count(), 1)

    def assert_region_rails_align(self):
        header = self.page.locator('[data-slot="page"] > header > div').bounding_box()
        main = self.page.locator('main#main-content > [data-page-container]').bounding_box()
        self.assertAlmostEqual(header["width"], main["width"], delta=1)
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))

    def test_single_uses_the_selected_sidebar_and_shared_page_rail(self):
        self.open_preview("preview/single")
        self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-state-ready]').wait_for()
        self.assertEqual(self.page.title(), "Single preview")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["A sample post"])
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="sidebar"]').count(), 1)
        trigger = self.page.locator("[data-sidebar-trigger]")
        self.assertEqual(trigger.count(), 1)
        self.assertEqual(trigger.get_attribute("aria-controls"), "preview-sidebar")
        self.assertEqual(trigger.get_attribute("aria-expanded"), "true")
        self.assertEqual(self.page.locator('[data-slot="sidebar-header"]').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="sidebar-content"]').count(), 1)
        self.assert_region_rails_align()

    def test_archive_without_sidebar_uses_the_same_page_regions_and_loop(self):
        self.open_preview("preview/archive")
        self.assertEqual(self.page.title(), "Archive preview")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Posts"])
        self.assertEqual(self.page.locator("main h2").count(), 2)
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="page"]').count(), 1)
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="sidebar"]').count(), 0)
        self.assertEqual(self.page.locator("[data-sidebar-trigger]").count(), 0)
        self.assert_region_rails_align()

    def test_mobile_sidebar_opens_with_aria_and_returns_keyboard_focus(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.open_preview("preview/single")
        trigger = self.page.locator("[data-sidebar-trigger]")
        trigger.click()
        sidebar = self.page.locator('[data-slot="sidebar"]')
        self.page.wait_for_function("document.querySelector('[data-slot=sidebar]').classList.contains('show')")
        self.assertEqual(sidebar.get_attribute("aria-modal"), "true")
        self.assertEqual(trigger.get_attribute("aria-expanded"), "true")
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        self.page.keyboard.press("Escape")
        self.page.wait_for_function("!document.querySelector('[data-slot=sidebar]').classList.contains('show')")
        self.assertTrue(trigger.evaluate("element => document.activeElement === element"))

    def test_sidebarless_archive_restores_dark_rtl_on_first_load(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.context.add_init_script("localStorage.setItem('moo:theme', 'dark'); localStorage.setItem('moo:direction', 'rtl')")
        self.open_preview("preview/archive")
        self.assertEqual(self.page.locator("html").get_attribute("dir"), "rtl")
        self.assertEqual(self.page.locator(".moo-ui").get_attribute("data-bs-theme"), "dark")
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="page"]').count(), 1)
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))


if __name__ == "__main__":
    unittest.main()
