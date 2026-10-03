"""Functional disclosure contracts; visual geometry requires human acceptance."""

import os
import unittest
from urllib.parse import urljoin

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class SidebarNavigation(unittest.TestCase):
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
        self.context.close()
        self.assertEqual(self.errors, [])

    def open_page(self, path):
        response = self.page.goto(urljoin(BASE_URL, path), wait_until="domcontentloaded")
        self.assertEqual(response.status, 200)
        self.page.locator('[data-moo-document-owner][data-moo-state="ready"]').wait_for()
        return self.page.locator('[data-slot="sidebar-content"]')

    def test_disclosure_uses_native_buttons_and_preserves_the_active_branch(self):
        navigation = self.open_page("guide/setup")
        pages = navigation.get_by_role("button", name="Pages", exact=True)
        expect(pages).to_have_attribute("aria-expanded", "true", timeout=5000)
        submenu = self.page.locator(f'#{pages.get_attribute("aria-controls")}')
        active = submenu.locator('a[aria-current="page"]')
        expect(active).to_have_attribute("href", "/guide/setup")
        expect(active).to_be_visible()
        pages.focus()
        self.page.keyboard.press("Enter")
        expect(pages).to_have_attribute("aria-expanded", "false")
        expect(active).to_be_hidden()
        self.page.keyboard.press("Space")
        expect(active).to_be_visible()
        expect(pages).to_be_focused()
        layouts = navigation.get_by_role("button", name="Layout profiles", exact=True)
        expect(layouts).to_have_attribute("aria-expanded", "false")
        layouts.click()
        navigation.get_by_role("link", name="Contained shell", exact=True).click()
        self.page.wait_for_url("**/preview/layouts/contained")
        expect(self.page.get_by_role("button", name="Layout profiles", exact=True)).to_have_attribute("aria-expanded", "true")

    def test_mobile_offcanvas_and_submenu_keep_keyboard_controls(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        navigation = self.open_page("")
        toggle = self.page.locator('header [data-sidebar-trigger]')
        toggle.click()
        expect(self.page.locator('[data-slot="sidebar"]')).to_have_attribute("aria-modal", "true")
        posts = navigation.get_by_role("button", name="Posts", exact=True)
        posts.focus()
        self.page.keyboard.press("Enter")
        expect(posts).to_have_attribute("aria-expanded", "true")
        expect(navigation.get_by_role("link", name="Post archive", exact=True)).to_be_visible()
        self.page.keyboard.press("Escape")
        expect(toggle).to_be_focused()
        expect(toggle).to_have_attribute("aria-expanded", "false")

    def test_collapsed_sidebar_uses_the_published_submenu_flyout(self):
        navigation = self.open_page("")
        self.page.locator('header [data-sidebar-trigger]').click()
        posts = navigation.get_by_role("button", name="Posts", exact=True)
        posts.click()
        flyout = self.page.locator('[data-sidebar-flyout]')
        expect(flyout).to_be_visible()
        expect(flyout.get_by_role("link", name="Post archive", exact=True)).to_have_attribute("href", "/posts")
        posts.click()
        expect(flyout).to_have_count(0)
        expect(posts).to_have_attribute("aria-expanded", "false")


if __name__ == "__main__":
    unittest.main()
