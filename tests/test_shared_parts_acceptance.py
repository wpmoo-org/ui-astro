"""Positive contracts for accepted shared regions and Layout-owned spacing.

The maintainer accepted the configurable spacing candidate on 2026-10-01.
These measurements protect that foundation, not a finished theme design.
"""

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
        self.assertEqual(trigger.get_attribute("aria-controls"),
                         self.page.locator('[data-slot="sidebar"]').get_attribute("id"))
        self.assertEqual(trigger.get_attribute("aria-expanded"), "true")
        self.assertEqual(self.page.locator('[data-slot="sidebar-header"]').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="sidebar-content"]').count(), 1)
        self.assert_region_rails_align()

    def test_archive_inherits_sidebar_and_uses_the_same_page_regions_and_loop(self):
        self.open_preview("preview/archive")
        self.assertEqual(self.page.title(), "Archive preview")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Posts"])
        self.assertEqual(self.page.locator("main h2").count(), 2)
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="page"]').count(), 1)
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="sidebar"]').count(), 1)
        trigger = self.page.locator("[data-sidebar-trigger]")
        self.assertEqual(trigger.count(), 1)
        self.assertEqual(trigger.get_attribute("aria-controls"),
                         self.page.locator('[data-slot="sidebar"]').get_attribute("id"))
        self.assert_region_rails_align()

    def test_layout_spacing_is_inherited_and_one_page_can_replace_it(self):
        for width, theme, direction in [(1440, "dark", "ltr"), (390, "light", "rtl")]:
            with self.subTest(width=width, theme=theme, direction=direction):
                self.page.set_viewport_size({"width": width, "height": 844})
                self.context.add_init_script(
                    f"localStorage.setItem('moo:theme', '{theme}'); "
                    f"localStorage.setItem('moo:direction', '{direction}')"
                )
                for path, inset_rem in [("preview/archive", 1.5), ("preview/single", 1.5),
                                        ("guide/setup", 1.5), ("posts", 1.5),
                                        ("posts/announcement", 1.5), ("contact", 0.5)]:
                    with self.subTest(path=path):
                        self.open_preview(path)
                        rail = self.page.locator('main#main-content > [data-page-container]')
                        metrics = rail.evaluate("""element => {
                            const style = getComputedStyle(element);
                            const title = element.querySelector('h1').getBoundingClientRect();
                            return {
                                rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
                                top: parseFloat(style.paddingTop),
                                bottom: parseFloat(style.paddingBottom),
                                titleInset: title.top - element.getBoundingClientRect().top,
                            };
                        }""")
                        inset = metrics["rem"] * inset_rem
                        self.assertAlmostEqual(metrics["top"], inset, delta=1)
                        self.assertAlmostEqual(metrics["bottom"], inset, delta=1)
                        self.assertAlmostEqual(metrics["titleInset"], inset, delta=1)
                        self.assert_region_rails_align()

    def test_archive_heading_and_items_keep_the_accepted_internal_spacing(self):
        for width in [1440, 390]:
            with self.subTest(width=width):
                self.page.set_viewport_size({"width": width, "height": 844})
                self.open_preview("preview/archive")
                metrics = self.page.locator("main").evaluate("""element => {
                    const heading = element.querySelector('h1');
                    const header = heading.closest('header');
                    const description = header.querySelector('p');
                    const list = element.querySelector('ul');
                    const [first, second] = list.children;
                    const itemHeading = first.querySelector('h2');
                    const itemDescription = first.querySelector('p');
                    return {
                        rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
                        headingGap: description.getBoundingClientRect().top - heading.getBoundingClientRect().bottom,
                        listInset: list.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
                        itemGap: second.getBoundingClientRect().top - first.getBoundingClientRect().bottom,
                        itemDescriptionGap: itemDescription.getBoundingClientRect().top - itemHeading.getBoundingClientRect().bottom,
                    };
                }""")
                for key, gap_rem in [("headingGap", 0.5), ("listInset", 1.5),
                                     ("itemGap", 1.5), ("itemDescriptionGap", 0.5)]:
                    self.assertAlmostEqual(metrics[key], metrics["rem"] * gap_rem, delta=1)

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

    def test_sidebarless_page_restores_dark_rtl_on_first_load(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.context.add_init_script("localStorage.setItem('moo:theme', 'dark'); localStorage.setItem('moo:direction', 'rtl')")
        self.open_preview("contact")
        self.assertEqual(self.page.locator("html").get_attribute("dir"), "rtl")
        self.assertEqual(self.page.locator(".moo-ui").get_attribute("data-bs-theme"), "dark")
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="page"]').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="sidebar"]').count(), 0)
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))

    def test_breadcrumb_and_header_controls_share_a_vertical_center(self):
        for width, theme, direction in [(1440, "light", "ltr"), (390, "dark", "rtl")]:
            with self.subTest(width=width, theme=theme, direction=direction):
                self.page.set_viewport_size({"width": width, "height": 844})
                self.context.add_init_script(
                    f"localStorage.setItem('moo:theme', '{theme}'); "
                    f"localStorage.setItem('moo:direction', '{direction}')"
                )
                self.open_preview("preview/single")
                header = self.page.locator('[data-slot="page"] > header')
                centers = [
                    locator.bounding_box()
                    for locator in [header.locator("ol.breadcrumb"),
                                    header.locator("[data-sidebar-trigger]"),
                                    header.locator('a[href="/"]').last]
                ]
                breadcrumb_center = centers[0]["y"] + centers[0]["height"] / 2
                for box in centers[1:]:
                    self.assertAlmostEqual(breadcrumb_center, box["y"] + box["height"] / 2, delta=1)
                self.assertEqual(self.page.locator("html").get_attribute("dir"), direction)
                self.assertEqual(self.page.locator(".moo-ui").get_attribute("data-bs-theme"), theme)
                self.assert_region_rails_align()

    def test_shared_example_menu_navigates_and_marks_the_current_page(self):
        self.open_preview("preview/single")
        menu = self.page.locator('[data-slot="sidebar-content"] nav')
        expected = ["/", "/contact", "/guide/setup", "/preview/single",
                    "/preview/archive", "/preview/page-archive",
                    "/preview/page-archive-slots", "/preview/i18n-empty"]
        hrefs = menu.locator("a").evaluate_all("links => links.map(link => link.getAttribute('href'))")
        self.assertTrue(set(expected).issubset(hrefs))
        self.assertEqual(len(hrefs), len(set(hrefs)))
        self.assertEqual(menu.locator('[aria-current="page"]').get_attribute("href"), "/preview/single")
        menu.get_by_role("button", name="Pages", exact=True).click()
        menu.locator('a[href="/guide/setup"]').click()
        self.page.wait_for_url("**/guide/setup")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Setup guide"])
        menu = self.page.locator('[data-slot="sidebar-content"] nav')
        self.assertEqual(menu.locator('[aria-current="page"]').get_attribute("href"), "/guide/setup")
        menu.get_by_role("button", name="Views", exact=True).click()
        menu.locator('a[href="/preview/single"]').click()
        self.page.wait_for_url("**/preview/single")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["A sample post"])


if __name__ == "__main__":
    unittest.main()
