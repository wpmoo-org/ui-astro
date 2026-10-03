"""Post layout contracts accepted on 2026-10-01.

Acceptance covers region ownership, independent Sidebar preferences, canonical
links and accessible controls. Padding and final theme styling remain open;
these contracts contain no spacing or pixel baseline.
"""

import os
import unittest
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class AcceptedPostLayouts(unittest.TestCase):
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
        self.assertEqual(self.page.locator('[data-moo-document-owner]').count(), 1)
        self.assertEqual(self.page.locator('[data-layout="app"]').count(), 1)
        self.assertEqual(self.page.locator("main").count(), 1)
        self.assertEqual(self.page.locator("main h1").count(), 1)
        self.assertEqual(self.page.locator('main > [data-page-container]').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="page"] > header').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="page"] > footer').count(), 1)
        self.assertEqual(self.page.locator("html").get_attribute("lang"), "en")
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))

    def test_post_single_view_override_preserves_archive(self):
        for width in [1440, 390]:
            for theme, direction in [("light", "ltr"), ("dark", "rtl")]:
                with self.subTest(width=width, theme=theme, direction=direction):
                    self.page.set_viewport_size({"width": width, "height": 900})
                    self.context.add_init_script(
                        f"localStorage.setItem('moo:theme', '{theme}');"
                        f"localStorage.setItem('moo:direction', '{direction}');"
                    )
                    for path, title, sidebars in [
                        ("posts/announcement", "A published announcement", 0),
                        ("posts", "Posts", 1),
                    ]:
                        self.open_page(path)
                        self.assertEqual(self.page.locator("main h1").all_text_contents(), [title])
                        self.assertEqual(self.page.locator('[data-slot="sidebar"]').count(), sidebars)
                        self.assertEqual(self.page.locator('[data-sidebar-trigger]').count(), sidebars)
                        self.assertEqual(self.page.locator('[data-moo-document-owner]').get_attribute("data-bs-theme"), theme)
                        self.assertEqual(self.page.locator("html").get_attribute("dir"), direction)

    def test_one_post_override_preserves_other_singles(self):
        self.open_page("posts")
        self.page.locator('main h2 a[href="/posts/layout-options"]').click()
        self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-ready]').wait_for()
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["One Post with a Sidebar"])
        self.assertEqual(self.page.locator('main article.post.post-id--en_002f_layout-options_002e_md').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="sidebar"]').count(), 1)
        self.page.locator('header a[href="/posts"]').click()
        self.page.locator('main h2 a[href="/posts/announcement"]').click()
        self.assertEqual(self.page.locator('main article.post.post-id--en_002f_announcement_002e_md').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="sidebar"]').count(), 0)
        self.assertEqual(self.page.locator('[data-sidebar-trigger]').count(), 0)
        self.assertEqual(self.page.locator("main time").inner_text(), "2026-09-21")
        self.assertEqual(self.page.locator("main time").get_attribute("datetime"), "2026-09-21T01:30:00.000Z")

    def test_post_archive_links_order_dates_and_regions_remain_owned(self):
        self.open_page("posts")
        links = self.page.locator("main h2 a")
        self.assertEqual(links.all_text_contents(), ["One Post with a Sidebar", "A published announcement"])
        self.assertEqual(links.evaluate_all("links => links.map(link => link.getAttribute('href'))"),
                         ["/posts/layout-options", "/posts/announcement"])
        self.assertEqual(self.page.locator("main time").all_text_contents(), ["2026-09-22", "2026-09-21"])
        self.assertEqual(self.page.locator('main li.post.post-id--en_002f_layout-options_002e_md').count(), 1)
        self.assertEqual(self.page.locator('main li.post.post-id--en_002f_announcement_002e_md').count(), 1)
        self.assertEqual(self.page.locator('.moo-ui.archive.post').count(), 1)
        self.assertEqual(self.page.locator('header nav[aria-label="Breadcrumb"]').count(), 1)
        self.assertEqual(self.page.locator('footer a').get_attribute("href"), "/")

    def test_narrow_post_sidebar_opens_by_keyboard_and_escape_returns_focus(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        for path in ["posts", "posts/layout-options"]:
            with self.subTest(path=path):
                self.open_page(path)
                self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-ready]').wait_for()
                trigger = self.page.locator('[data-sidebar-trigger]')
                sidebar = self.page.locator('[data-slot="sidebar"]')
                self.assertEqual(trigger.get_attribute("aria-controls"), sidebar.get_attribute("id"))
                trigger.focus()
                self.assertTrue(trigger.evaluate("element => element.matches(':focus-visible')"))
                self.page.keyboard.press("Enter")
                self.page.locator('[data-slot="sidebar"].show').wait_for()
                self.assertEqual(trigger.get_attribute("aria-expanded"), "true")
                self.assertEqual(sidebar.get_attribute("aria-modal"), "true")
                self.page.keyboard.press("Escape")
                self.page.locator('[data-slot="sidebar"].show').wait_for(state="hidden")
                self.assertEqual(trigger.get_attribute("aria-expanded"), "false")
                self.assertTrue(trigger.evaluate("element => document.activeElement === element"))
                self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))


if __name__ == "__main__":
    unittest.main()
