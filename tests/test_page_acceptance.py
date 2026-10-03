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
        self.open_page("contact")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Contact"])
        self.assertEqual(self.page.locator("main article.page.page-id--en_002f_contact_002e_md").count(), 1)
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="sidebar"]').count(), 0)
        self.assertEqual(self.page.locator('[data-sidebar-trigger]').count(), 0)
        self.assertIn("Contact page body.", self.page.locator("main").inner_text())

    def test_other_page_inherits_sidebar_and_uses_its_canonical_links(self):
        self.open_page("guide/setup")
        self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-state-ready]').wait_for()
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Setup guide"])
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="sidebar"]').count(), 1)
        self.assertEqual(self.page.locator('[data-slot="sidebar"] a[aria-current="page"]').get_attribute("href"), "/guide/setup")
        self.assertEqual(self.page.locator('[data-sidebar-trigger]').get_attribute("aria-controls"),
                         self.page.locator('[data-slot="sidebar"]').get_attribute("id"))
        self.assertEqual(self.page.locator('[data-sidebar-trigger]').get_attribute("aria-expanded"), "true")
        self.assertEqual(self.page.locator('footer a').get_attribute("href"), "/")

    def test_narrow_page_sidebar_opens_by_keyboard_and_escape_returns_focus(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.open_page("guide/setup")
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
        self.assertEqual(self.page.locator("main h2 a").evaluate_all("links => links.map(link => link.getAttribute('href'))"), ["/contact", "/guide/setup"])
        self.assertEqual(self.page.locator('[data-layout="app"] > [data-slot="sidebar"]').count(), 1)

    def test_file_managed_sections_inherit_layout_and_keep_their_authored_identity(self):
        for width, theme, direction in [(1440, "light", "ltr"), (390, "dark", "rtl")]:
            with self.subTest(width=width, theme=theme, direction=direction):
                self.context.close()
                self.context = self.browser.new_context(viewport={"width": width, "height": 844})
                self.context.add_init_script(
                    f"localStorage.setItem('moo:theme', '{theme}');"
                    f"localStorage.setItem('moo:direction', '{direction}');"
                )
                self.page = self.context.new_page()
                self.page.on("pageerror", lambda error: self.errors.append(str(error)))
                spacing = """rail => {
                    const style = getComputedStyle(rail);
                    return [style.paddingTop, style.paddingBottom];
                }"""
                self.open_page("posts")
                inherited = self.page.locator('main > [data-page-container]').evaluate(spacing)
                self.open_page("editable")
                self.page.locator('[data-slot="sidebar-wrapper"][data-sidebar-state-ready]').wait_for()
                self.assertEqual(self.page.locator("main").count(), 1)
                self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Page with sections"])
                self.assertEqual(self.page.locator('[data-slot="page"] > header').count(), 1)
                self.assertEqual(self.page.locator('[data-slot="page"] > footer').count(), 1)
                self.assertEqual(self.page.locator('[data-slot="sidebar"]').count(), 1)
                self.assertEqual(self.page.locator("html").get_attribute("dir"), direction)
                self.assertEqual(self.page.locator('[data-moo-document-owner]').get_attribute("data-bs-theme"), theme)
                article = self.page.locator("main article.page.page-id--en_002f_editable_002e_md")
                self.assertEqual(article.count(), 1)
                sections = article.locator('[data-section-type]')
                self.assertEqual(sections.evaluate_all(
                    "sections => sections.map(section => [section.id, section.dataset.sectionType])"),
                    [["introduction", "text"], ["related-content", "action"]])
                text = article.locator('section[data-section-type="text"]')
                self.assertEqual(text.get_attribute("aria-labelledby"), text.locator("h2").get_attribute("id"))
                rail = self.page.locator('main > [data-page-container]')
                self.assertEqual(rail.evaluate(spacing), inherited)
                self.assertTrue(rail.evaluate("""rail => {
                    const bounds = rail.getBoundingClientRect();
                    return [...rail.querySelectorAll('[data-section-type]')].every(section => {
                        const child = section.getBoundingClientRect();
                        return child.left >= bounds.left - 1 && child.right <= bounds.right + 1;
                    });
                }"""))
                action = article.get_by_role("button", name="Explore related content", exact=True)
                self.assertEqual(action.get_attribute("href"), "/topics/category/layouts")
                action.click()
                self.page.wait_for_url("**/topics/category/layouts")
                self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Layouts"])


if __name__ == "__main__":
    unittest.main()
