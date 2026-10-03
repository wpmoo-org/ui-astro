"""Positive contracts for the accepted native language menu and breadcrumb.

Acceptance: 2026-10-02, desktop/narrow, light/dark and LTR/RTL. These
measure the shown control and ownership, not the final theme's appearance.
The demo locale is now German; the previously accepted geometry checks are
unchanged. Navigation grouping is still a visual candidate.
"""

import os
import unittest
from urllib.parse import urljoin

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class AcceptedLanguageControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def inspect_profile(self, width, theme, direction, path):
        context = self.browser.new_context(viewport={"width": width, "height": 900})
        self.addCleanup(context.close)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        self.assertEqual(page.goto(BASE_URL, wait_until="domcontentloaded").status, 200)
        owner = page.locator('[data-moo-document-owner][data-moo-state="ready"]')
        owner.wait_for()
        if owner.get_attribute("data-bs-theme") != theme:
            page.locator("[data-theme-toggle]").click()
        if page.locator("html").get_attribute("dir") != direction:
            page.locator("[data-direction-toggle]").click()
        self.assertEqual(page.goto(urljoin(BASE_URL, path), wait_until="domcontentloaded").status, 200)
        owner.wait_for()
        self.assertEqual(owner.count(), 1)
        self.assertEqual(owner.get_attribute("data-bs-theme"), theme)
        self.assertEqual(page.locator("html").get_attribute("dir"), direction)
        self.assertEqual(page.locator("html").get_attribute("lang"), "de")
        self.assertEqual(page.locator("main").count(), 1)
        self.assertEqual(page.locator("main h1").count(), 1)
        self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), width)
        return page, errors

    def test_language_menu_preserves_visible_selection_geometry_and_keyboard_focus(self):
        for width, theme, direction in [(1440, "light", "ltr"), (1440, "dark", "rtl"),
                                        (390, "light", "ltr"), (390, "dark", "rtl")]:
            with self.subTest(width=width, theme=theme, direction=direction):
                page, errors = self.inspect_profile(width, theme, direction, "de/einrichtung")
                trigger = page.get_by_role("button", name="Seitensprache wählen", exact=True)
                expect(trigger).to_be_visible()
                trigger.focus()
                page.keyboard.press("Enter")
                expect(trigger).to_have_attribute("aria-expanded", "true")
                menu = page.locator("header .dropdown-menu")
                expect(menu).to_be_visible()
                selected = menu.locator('[aria-current="true"]')
                expect(selected).to_have_accessible_name("Deutsch")
                expect(selected).to_have_attribute("href", "/de/einrichtung")
                expect(menu.get_by_role("link", name="English", exact=True)).to_have_attribute("href", "/guide/setup")
                menu_box = menu.bounding_box()
                self.assertGreater(menu_box["width"], 0)
                self.assertGreaterEqual(menu_box["x"], -1)
                self.assertLessEqual(menu_box["x"] + menu_box["width"], width + 1)
                page.keyboard.press("ArrowDown")
                self.assertTrue(menu.evaluate("element => element.contains(document.activeElement)"))
                page.keyboard.press("Escape")
                expect(menu).to_be_hidden()
                expect(trigger).to_have_attribute("aria-expanded", "false")
                expect(trigger).to_be_focused()
                self.assertEqual(errors, [])

    def test_contact_breadcrumb_keeps_the_brand_and_current_page_on_the_header_rail(self):
        for width, theme, direction in [(1440, "light", "ltr"), (1440, "dark", "rtl"),
                                        (390, "light", "ltr"), (390, "dark", "rtl")]:
            with self.subTest(width=width, theme=theme, direction=direction):
                page, errors = self.inspect_profile(width, theme, direction, "de/kontakt")
                breadcrumb = page.get_by_role("navigation", name="Navigationspfad", exact=True)
                expect(breadcrumb.get_by_role("link", name="Moo UI Astro", exact=True)).to_have_attribute("href", "/de/kontakt")
                expect(breadcrumb.locator('[aria-current="page"]')).to_have_text("Kontakt")
                trigger = page.get_by_role("button", name="Seitensprache wählen", exact=True)
                breadcrumb_box, trigger_box = breadcrumb.bounding_box(), trigger.bounding_box()
                self.assertGreater(breadcrumb_box["width"], 0)
                self.assertLess(abs(breadcrumb_box["y"] + breadcrumb_box["height"] / 2
                                    - trigger_box["y"] - trigger_box["height"] / 2), 2)
                self.assertGreaterEqual(breadcrumb_box["x"], -1)
                self.assertLessEqual(breadcrumb_box["x"] + breadcrumb_box["width"], width + 1)
                self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
