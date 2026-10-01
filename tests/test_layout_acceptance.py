"""Positive contracts for the Archive/Layout candidates accepted on 2026-10-01.

These checks protect slot forwarding, region ownership, the accepted shell
profiles and the usable Page grid. They do not define a finished theme.
"""

import os
import unittest
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class AcceptedLayouts(unittest.TestCase):
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
        self.assertEqual(self.page.locator('[data-layout="app"]').count(), 1)
        self.assertEqual(self.page.locator("main").count(), 1)
        self.assertEqual(self.page.locator('main > [data-page-container]').count(), 1)
        self.assertEqual(self.page.locator("main h1").count(), 1)
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))

    def grid_boxes(self):
        # Measure the whole row in one frame, including during Sidebar transitions.
        return self.page.locator('[data-layout="page-grid"] > div').evaluate_all("""columns => columns.map(column => {
            const box = column.getBoundingClientRect();
            return { y: box.y, width: box.width };
        })""")

    def test_custom_archive_slots_preserve_the_supplied_header_loop_and_after_list(self):
        for width, theme, direction in [(1440, "light", "ltr"), (390, "dark", "rtl")]:
            with self.subTest(width=width, theme=theme, direction=direction):
                self.page.set_viewport_size({"width": width, "height": 900})
                self.context.add_init_script(
                    f"localStorage.setItem('moo:theme', '{theme}');"
                    f"localStorage.setItem('moo:direction', '{direction}');"
                )
                self.open_page("preview/page-archive-slots")
                self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Custom Pages"])
                links = self.page.locator("main h2 a")
                self.assertEqual(links.all_text_contents(), ["Setup guide", "Contact"])
                self.assertEqual(links.evaluate_all("items => items.map(item => item.getAttribute('href'))"),
                                 ["/guide/setup", "/contact"])
                self.assertEqual(self.page.locator("main p").last.inner_text(),
                                 "End of the published Page list.")
                self.assertEqual(self.page.locator('footer a').get_attribute("href"), "/")
                self.assertEqual(self.page.locator("html").get_attribute("dir"), direction)
                self.assertEqual(self.page.locator('[data-moo-document-owner]').get_attribute("data-bs-theme"), theme)

    def test_viewport_shell_keeps_long_content_in_the_main_scroll_owner(self):
        for width, height in [(1440, 900), (390, 844)]:
            with self.subTest(width=width):
                self.page.set_viewport_size({"width": width, "height": height})
                self.open_page("preview/layouts/viewport")
                app = self.page.locator('[data-layout="app"]')
                main = self.page.locator("main")
                self.assertAlmostEqual(app.bounding_box()["height"], height, delta=1)
                self.assertEqual(main.evaluate("element => getComputedStyle(element).overflowY"), "auto")
                self.assertTrue(main.evaluate("element => element.scrollHeight > element.clientHeight"))
                regions = self.page.locator('[data-slot="page"] > header, [data-slot="page"] > main, [data-slot="page"] > footer')
                self.assertEqual(regions.count(), 3)
                boxes = [regions.nth(index).bounding_box() for index in range(3)]
                self.assertAlmostEqual(boxes[0]["y"] + boxes[0]["height"], boxes[1]["y"], delta=1)
                self.assertAlmostEqual(boxes[1]["y"] + boxes[1]["height"], boxes[2]["y"], delta=1)

    def test_contained_shell_scrolls_within_its_desktop_frame(self):
        self.open_page("preview/layouts/contained")
        self.assertLess(self.page.locator('[data-layout="app"]').bounding_box()["height"], 900)
        self.assertTrue(self.page.locator("main").evaluate("element => element.scrollHeight > element.clientHeight"))
        self.assertTrue(self.page.locator('[data-sidebar-trigger]').is_visible())

    def test_page_grid_reflows_when_the_sidebar_changes_usable_width(self):
        self.page.set_viewport_size({"width": 1024, "height": 900})
        self.open_page("preview/layouts/viewport")
        self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-ready]').wait_for()
        boxes = self.grid_boxes()
        self.assertLess(boxes[0]["y"], boxes[1]["y"])
        self.assertLess(boxes[1]["y"], boxes[2]["y"])
        trigger = self.page.locator('[data-sidebar-trigger]')
        trigger.click()
        self.page.wait_for_function("""() => {
            const columns = document.querySelectorAll('[data-layout="page-grid"] > div');
            return Math.abs(columns[0].getBoundingClientRect().top - columns[2].getBoundingClientRect().top) < 1;
        }""")
        self.assertEqual(trigger.get_attribute("aria-expanded"), "false")
        boxes = self.grid_boxes()
        for box in boxes[1:]:
            self.assertAlmostEqual(boxes[0]["y"], box["y"], delta=1)
            self.assertAlmostEqual(boxes[0]["width"], box["width"], delta=1)

    def test_explicit_fluid_header_is_wider_than_the_selected_page_container(self):
        self.context.add_init_script("localStorage.setItem('moo-sidebar:astro-demo', 'collapsed')")
        self.open_page("preview/layouts/fluid-header")
        header = self.page.locator('[data-slot="page"] > header > div').bounding_box()
        main = self.page.locator('main > [data-page-container]').bounding_box()
        self.assertGreater(header["width"], main["width"])

    def test_right_inset_sidebar_keeps_its_physical_side_in_dark_rtl(self):
        self.context.add_init_script("localStorage.setItem('moo:theme', 'dark'); localStorage.setItem('moo:direction', 'rtl')")
        self.open_page("preview/layouts/right-sidebar")
        sidebar = self.page.locator('[data-slot="sidebar"]')
        page = self.page.locator('[data-slot="page"]')
        self.assertEqual(sidebar.get_attribute("data-side"), "right")
        self.assertEqual(sidebar.get_attribute("data-variant"), "inset")
        self.assertGreater(sidebar.bounding_box()["x"], page.bounding_box()["x"])
        self.assertEqual(self.page.locator("html").get_attribute("dir"), "rtl")
        self.assertEqual(self.page.locator('[data-moo-document-owner]').get_attribute("data-bs-theme"), "dark")

    def test_first_paint_restores_document_and_keyed_sidebar_before_runtime_scripts(self):
        self.context.add_init_script("""
            localStorage.setItem('moo:theme', 'dark');
            localStorage.setItem('moo:direction', 'rtl');
            localStorage.setItem('moo-sidebar:astro-demo', 'collapsed');
        """)
        # Network runtime modules cannot supply the inline first-paint state.
        self.page.route("**/*", lambda route: route.abort() if route.request.resource_type == "script" else route.continue_())
        for path, sidebar_count in [("preview/layouts/viewport", 1), ("contact", 0)]:
            with self.subTest(path=path):
                response = self.page.goto(urljoin(BASE_URL, path), wait_until="domcontentloaded")
                self.assertEqual(response.status, 200)
                owner = self.page.locator('[data-moo-document-owner]')
                self.assertEqual(owner.count(), 1)
                self.assertEqual(owner.get_attribute("data-moo-state"), "ready")
                self.assertEqual(owner.get_attribute("data-bs-theme"), "dark")
                self.assertEqual(self.page.locator("html").get_attribute("dir"), "rtl")
                wrapper = self.page.locator('[data-slot="sidebar-wrapper"]')
                self.assertEqual(wrapper.count(), sidebar_count)
                if sidebar_count:
                    self.assertEqual(wrapper.get_attribute("data-sidebar-key"), "astro-demo")
                    self.assertEqual(wrapper.get_attribute("data-sidebar-state"), "collapsed")
                    self.assertIsNotNone(wrapper.get_attribute("data-sidebar-state-ready"))


if __name__ == "__main__":
    unittest.main()
