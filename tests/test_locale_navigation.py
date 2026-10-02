"""Functional contracts for staying on actual published locale routes.

These checks cover navigation and language selection, without visual baselines.
"""

import os
import unittest
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class LocaleNavigation(unittest.TestCase):
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

    def open_page(self, path, locale):
        response = self.page.goto(urljoin(BASE_URL, path), wait_until="domcontentloaded")
        self.assertEqual(response.status, 200)
        self.page.locator('[data-moo-document-owner][data-moo-state="ready"]').wait_for()
        self.assertEqual(self.page.locator("html").get_attribute("lang"), locale)

    def test_language_selection_survives_contact_navigation_and_reload(self):
        self.open_page("guide/setup", "en")
        self.page.get_by_role("button", name="Choose page language", exact=True).click()
        self.page.get_by_role("link", name="English (UK)", exact=True).click()
        self.page.wait_for_url("**/en-gb/getting-started")
        sidebar = self.page.locator('[data-slot="sidebar"]')
        contact = sidebar.get_by_role("link", name="Contact · no Sidebar", exact=True)
        self.assertEqual(contact.get_attribute("href"), "/en-gb/contact-us")
        contact.click()
        self.page.wait_for_url("**/en-gb/contact-us")
        self.assertEqual(self.page.locator("html").get_attribute("lang"), "en-gb")
        self.assertEqual(self.page.locator("main h1").all_text_contents(), ["Contact"])
        self.assertEqual(self.page.reload().status, 200)
        self.assertEqual(urlsplit(self.page.url).path, "/en-gb/contact-us")
        self.assertEqual(self.page.locator("html").get_attribute("lang"), "en-gb")
        self.page.get_by_role("button", name="Choose page language", exact=True).click()
        self.page.get_by_role("link", name="English", exact=True).click()
        self.page.wait_for_url("**/contact")
        self.assertEqual(self.page.locator("html").get_attribute("lang"), "en")

    def test_locale_home_links_use_a_published_page(self):
        self.open_page("en-gb/getting-started", "en-gb")
        for selector in [
            '[data-slot="sidebar-header"] a',
            'header nav[aria-label="Breadcrumb"] a',
            '[data-slot="page"] > footer a',
        ]:
            with self.subTest(selector=selector):
                link = self.page.locator(selector)
                self.assertEqual(link.get_attribute("href"), "/en-gb/contact-us")
                link.click()
                self.page.wait_for_url("**/en-gb/contact-us")
                self.assertEqual(self.page.locator("html").get_attribute("lang"), "en-gb")
                self.open_page("en-gb/getting-started", "en-gb")

    def test_contact_brand_survives_native_language_switch(self):
        for width in [1440, 390]:
            with self.subTest(width=width):
                self.page.set_viewport_size({"width": width, "height": 900})
                self.open_page("contact", "en")
                for locale, label, path, home_href in [
                    ("en-gb", "English (UK)", "/en-gb/contact-us", "/en-gb/contact-us"),
                    ("en", "English", "/contact", "/"),
                ]:
                    self.page.get_by_role("button", name="Choose page language", exact=True).click()
                    self.page.get_by_role("link", name=label, exact=True).click()
                    self.page.wait_for_url(f"**{path}")
                    self.assertEqual(self.page.locator("html").get_attribute("lang"), locale)
                    breadcrumb = self.page.get_by_role("navigation", name="Breadcrumb", exact=True)
                    brand = breadcrumb.get_by_role("link", name="Moo UI Astro", exact=True)
                    self.assertEqual(brand.count(), 1)
                    self.assertTrue(brand.is_visible())
                    self.assertEqual(brand.get_attribute("href"), home_href)
                    self.assertEqual(breadcrumb.locator('[aria-current="page"]').all_text_contents(), ["Contact"])

    def test_locale_menu_offers_only_real_pages_posts_and_terms(self):
        self.open_page("en-gb/getting-started", "en-gb")
        links = self.page.locator('[data-slot="sidebar-content"] a[data-slot="sidebar-menu-button"]')
        hrefs = links.evaluate_all("links => links.map(link => link.getAttribute('href'))")
        expected = [
            "/en-gb/contact-us",
            "/en-gb/getting-started",
            "/en-gb/posts",
            "/en-gb/posts/release-notes",
            "/en-gb/topics/category/guides",
            "/en-gb/topics/category/layouts",
            "/en-gb/topics/tag/astro",
            "/en-gb/topics/tag/empty",
            "/en-gb/topics/sector/foundation",
        ]
        self.assertCountEqual(hrefs, expected)
        for href in expected:
            with self.subTest(href=href):
                self.open_page(href, "en-gb")
                content_links = self.page.locator("main h2 a").evaluate_all(
                    "links => links.map(link => link.getAttribute('href'))")
                self.assertTrue(all(value.startswith("/en-gb/") for value in content_links))


if __name__ == "__main__":
    unittest.main()
