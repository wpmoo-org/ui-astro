"""Positive contracts for taxonomy archive views accepted on 2026-10-01.

Archives inherit the shared Layout and render supplied mixed-type items. This
acceptance covers that foundation, rather than a finished theme or pixel baseline.
"""

import os
import unittest
from urllib.parse import urljoin

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class AcceptedTaxonomyArchives(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = None
        self.errors = []
        self.set_profile(1440, "light", "ltr")

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def set_profile(self, width, theme, direction):
        if self.context:
            self.context.close()
        self.context = self.browser.new_context(viewport={"width": width, "height": 844})
        self.context.add_init_script(
            f"localStorage.setItem('moo:theme', '{theme}');"
            f"localStorage.setItem('moo:direction', '{direction}');"
        )
        self.page = self.context.new_page()
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def open_archive(self, path, title):
        response = self.page.goto(urljoin(BASE_URL, path), wait_until="domcontentloaded")
        self.assertEqual(response.status, 200)
        self.page.locator('[data-moo-document-owner][data-moo-state="ready"]').wait_for()
        self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-ready]').wait_for()
        self.assertEqual(self.page.title(), title)
        self.assertEqual(self.page.locator('[data-moo-document-owner]').count(), 1)
        self.assertEqual(self.page.locator('[data-layout="app"]').count(), 1)
        self.assertEqual(self.page.locator("main").count(), 1)
        self.assertEqual(self.page.locator("main h1").all_text_contents(), [title])
        self.assertEqual(self.page.locator('main > [data-page-container]').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="page"] > header').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="page"] > footer').count(), 1)
        self.assertEqual(self.page.locator("html").get_attribute("lang"), "en")
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))

    def layout_metrics(self):
        return self.page.locator('[data-slot="page"]').evaluate("""page => {
            const rail = page.querySelector('main > [data-page-container]');
            const headerRail = page.querySelector(':scope > header > div');
            const style = getComputedStyle(rail);
            return {
                top: parseFloat(style.paddingTop),
                bottom: parseFloat(style.paddingBottom),
                titleInset: rail.querySelector('h1').getBoundingClientRect().top - rail.getBoundingClientRect().top,
                width: rail.getBoundingClientRect().width,
                headerWidth: headerRail.getBoundingClientRect().width,
            };
        }""")

    def test_taxonomy_archive_inherits_one_layout_and_shared_region_spacing(self):
        for width in [1440, 390]:
            for theme in ["light", "dark"]:
                for direction in ["ltr", "rtl"]:
                    with self.subTest(width=width, theme=theme, direction=direction):
                        self.set_profile(width, theme, direction)
                        self.open_archive("posts", "Posts")
                        inherited = self.layout_metrics()
                        self.open_archive("topics/category/guides", "Guides")
                        actual = self.layout_metrics()
                        for field in ["top", "bottom", "titleInset"]:
                            self.assertAlmostEqual(actual[field], inherited[field], delta=1)
                        self.assertAlmostEqual(actual["width"], actual["headerWidth"], delta=1)
                        root = self.page.locator('[data-moo-document-owner]')
                        self.assertEqual(root.get_attribute("data-bs-theme"), theme)
                        self.assertEqual(self.page.locator("html").get_attribute("dir"), direction)
                        self.assertTrue({"moo-ui", "archive", "category", "category-guides"}.issubset(
                            set(root.get_attribute("class").split())))

    def test_descendant_archive_links_reach_the_parent_and_mixed_content(self):
        self.open_archive("topics/category/layouts", "Layouts")
        breadcrumb = self.page.get_by_role("navigation", name="Breadcrumb", exact=True)
        self.assertEqual(breadcrumb.get_by_text("Categories: Layouts", exact=True).count(), 1)
        breadcrumb.get_by_role("link", name="Guides", exact=True).click()
        self.page.wait_for_url("**/topics/category/guides")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Guides"])
        links = self.page.locator("main h2 a")
        self.assertEqual(links.all_text_contents(),
                         ["Setup guide", "A published announcement", "One Post with a Sidebar"])
        self.assertEqual(links.evaluate_all("links => links.map(link => link.getAttribute('href'))"),
                         ["/guide/setup", "/posts/announcement", "/posts/layout-options"])
        for identity in ["page-id--guide_002f_setup_002e_md", "post-announcement", "post-layout-options"]:
            self.assertEqual(self.page.locator(f"main li.{identity}").count(), 1)
        self.page.locator('main h2 a[href="/guide/setup"]').click()
        self.page.wait_for_url("**/guide/setup")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Setup guide"])
        self.open_archive("topics/category/guides", "Guides")
        self.page.locator('main h2 a[href="/posts/announcement"]').click()
        self.page.wait_for_url("**/posts/announcement")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["A published announcement"])
        self.assertEqual(self.page.locator('[data-slot="sidebar"]').count(), 0)

    def test_empty_and_custom_terms_use_the_shared_archive_regions(self):
        self.open_archive("topics/tag/empty", "Empty tag")
        self.assertEqual(self.page.get_by_text("No items yet.", exact=True).count(), 1)
        self.assertEqual(self.page.locator("main h2 a").count(), 0)
        self.assertEqual(self.page.locator('.moo-ui.archive.tag.tag-empty').count(), 1)
        self.open_archive("topics/sector/foundation", "Foundation")
        self.assertEqual(self.page.locator('.moo-ui.archive.tax-sector.tax-sector--foundation').count(), 1)
        self.assertEqual(self.page.locator("main h2 a").all_text_contents(),
                         ["Setup guide", "A published announcement"])
        self.assertEqual(self.page.locator("main time").get_attribute("datetime"),
                         "2026-09-21T01:30:00.000Z")

    def test_narrow_archive_sidebar_restores_aria_and_keyboard_focus(self):
        for theme, direction in [("light", "ltr"), ("dark", "rtl")]:
            with self.subTest(theme=theme, direction=direction):
                self.set_profile(390, theme, direction)
                self.open_archive("topics/category/guides", "Guides")
                trigger = self.page.locator('[data-sidebar-trigger]')
                sidebar = self.page.locator('[data-slot="sidebar"]')
                self.assertEqual(trigger.get_attribute("aria-controls"), sidebar.get_attribute("id"))
                expect(trigger).to_have_attribute("aria-expanded", "false")
                trigger.focus()
                self.assertTrue(trigger.evaluate("element => element.matches(':focus-visible')"))
                trigger.press("Enter")
                self.page.locator('[data-slot="sidebar"].show').wait_for()
                expect(trigger).to_have_attribute("aria-expanded", "true")
                expect(sidebar).to_have_attribute("aria-modal", "true")
                sidebar.get_by_role("link", name="Contact", exact=True).focus()
                self.page.keyboard.press("Escape")
                self.page.locator('[data-slot="sidebar"].show').wait_for(state="hidden")
                expect(trigger).to_have_attribute("aria-expanded", "false")
                expect(trigger).to_be_focused()
                self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))


if __name__ == "__main__":
    unittest.main()
