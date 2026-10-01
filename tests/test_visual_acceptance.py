"""Positive browser contracts for the user-accepted RC9 Astro demo surface.

Run against the existing `make ui-astro` server on port 4322. Set
ASTRO_BASE_URL to inspect the same accepted surface from a packed consumer.
"""

import os
import unittest

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class AcceptedAstroSurface(unittest.TestCase):
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
        response = self.page.goto(BASE_URL, wait_until="domcontentloaded")
        self.assertEqual(response.status, 200)
        self.page.locator('[data-moo-document-owner][data-moo-state="ready"]').wait_for()
        self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-state-ready]').wait_for()

    def tearDown(self):
        self.context.close()

    def test_initial_document_and_direct_app_page_topology(self):
        result = self.page.evaluate("""() => {
          const owner = document.querySelector('[data-moo-document-owner]');
          const app = owner.querySelector('[data-layout="app"]');
          const page = app.querySelector(':scope > [data-slot="page"]');
          const sidebar = app.querySelector(':scope > [data-slot="sidebar"]');
          const trigger = page.querySelector('[data-sidebar-trigger]');
          return {
            ownerFirst: owner.firstElementChild?.tagName,
            appFirst: app.firstElementChild?.tagName,
            siblings: sidebar?.nextElementSibling === page,
            mainCount: document.querySelectorAll('main').length,
            mainFocusTarget: page.querySelector('main#main-content')?.tabIndex,
            pageRail: Boolean(page.querySelector('main > [data-page-container]')),
            triggerControls: trigger?.getAttribute('aria-controls'),
            triggerExpanded: trigger?.getAttribute('aria-expanded'),
            sidebarId: sidebar?.id,
            theme: owner.dataset.bsTheme,
            direction: document.documentElement.dir,
          };
        }""")
        self.assertEqual(result["ownerFirst"], "SCRIPT")
        self.assertEqual(result["appFirst"], "SCRIPT")
        self.assertTrue(result["siblings"])
        self.assertEqual(result["mainCount"], 1)
        self.assertEqual(result["mainFocusTarget"], -1)
        self.assertTrue(result["pageRail"])
        self.assertEqual(result["triggerControls"], result["sidebarId"])
        self.assertEqual(result["triggerExpanded"], "true")
        self.assertEqual((result["theme"], result["direction"]), ("dark", "ltr"))

    def test_desktop_sidebar_and_page_grid_follow_available_width(self):
        self.page.set_viewport_size({"width": 1159, "height": 900})
        rail = self.page.locator("[data-page-container]")
        grid = self.page.locator('[data-layout="page-grid"]')
        self.page.wait_for_timeout(400)
        expanded_width = rail.bounding_box()["width"]
        self.assertNotEqual(self.page.locator('[data-page-hide-from="lg"]').evaluate("e => getComputedStyle(e).display"), "none")
        self.assertEqual(self.page.locator('[data-page-show-from="lg"]').evaluate("e => getComputedStyle(e).display"), "none")
        self.page.locator("[data-sidebar-trigger]").click()
        self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-state="collapsed"]').wait_for()
        self.page.wait_for_timeout(400)
        collapsed_width = rail.bounding_box()["width"]
        self.assertGreater(collapsed_width - expanded_width, 150)
        self.assertGreater(collapsed_width, 1000)
        self.assertEqual(self.page.locator("[data-sidebar-trigger]").get_attribute("aria-expanded"), "false")
        self.assertEqual(self.page.locator('[data-page-hide-from="lg"]').evaluate("e => getComputedStyle(e).display"), "none")
        self.assertNotEqual(self.page.locator('[data-page-show-from="lg"]').evaluate("e => getComputedStyle(e).display"), "none")
        self.assertEqual(grid.get_attribute("data-layout"), "page-grid")

    def test_narrow_offcanvas_aria_and_focus_return(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
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

    def test_sidebar_names_and_registered_glyphs_survive_collapse_and_mobile(self):
        sidebar = self.page.locator('[data-slot="sidebar"]')
        trigger = self.page.locator('[data-sidebar-trigger]')

        def named_links():
            for name in ("Moo UI Astro", "Overview", "Single", "Archive"):
                expect(sidebar.get_by_role("link", name=name, exact=True)).to_have_accessible_name(name)
            for name in ("Single", "Archive"):
                glyph = sidebar.get_by_role("link", name=name, exact=True).locator("svg")
                bounds = glyph.evaluate("e => { const b = e.getBBox(); return { width: b.width, height: b.height }; }")
                self.assertGreater(bounds["width"], 0)
                self.assertGreater(bounds["height"], 0)

        named_links()
        trigger.click()
        self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-state="collapsed"]').wait_for()
        self.assertEqual(sidebar.locator('a[href="/preview/single"] .sidebar-menu-button__text')
                         .evaluate("e => getComputedStyle(e).display"), "none")
        named_links()
        self.page.locator('[data-theme-toggle]').click()
        self.page.locator('[data-direction-toggle]').click()
        named_links()
        self.page.set_viewport_size({"width": 390, "height": 844})
        trigger.click()
        self.page.wait_for_function("document.querySelector('[data-slot=sidebar]').classList.contains('show')")
        self.assertEqual(sidebar.get_attribute("aria-modal"), "true")
        named_links()
        self.page.keyboard.press("Escape")
        self.page.wait_for_function("!document.querySelector('[data-slot=sidebar]').classList.contains('show')")
        expect(trigger).to_be_focused()

    def test_theme_direction_persist_and_keyboard_focus_is_visible(self):
        trigger = self.page.locator("[data-sidebar-trigger]")
        # The host's example menu can grow; allow one finite traversal of its controls.
        for _ in range(self.page.locator("a[href], button, input, select, textarea, [tabindex]").count() + 1):
            self.page.keyboard.press("Tab")
            if trigger.evaluate("element => document.activeElement === element"):
                break
        self.assertTrue(trigger.evaluate("element => document.activeElement === element"))
        self.page.wait_for_timeout(180)
        self.assertTrue(trigger.evaluate("e => e.matches(':focus-visible')"))
        self.assertIn("3px", trigger.evaluate("e => getComputedStyle(e).boxShadow"))
        self.page.locator("[data-theme-toggle]").click()
        self.page.locator("[data-direction-toggle]").click()
        self.assertEqual(self.page.locator("[data-moo-document-owner]").get_attribute("data-bs-theme"), "light")
        self.assertEqual(self.page.locator("html").get_attribute("dir"), "rtl")
        self.page.reload(wait_until="domcontentloaded")
        self.page.locator('[data-moo-document-owner][data-moo-state="ready"]').wait_for()
        self.assertEqual(self.page.locator("[data-moo-document-owner]").get_attribute("data-bs-theme"), "light")
        self.assertEqual(self.page.locator("html").get_attribute("dir"), "rtl")


if __name__ == "__main__":
    unittest.main()
