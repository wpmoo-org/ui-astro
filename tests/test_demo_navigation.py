"""Functional contracts for the shared demo navigation requested on 2026-10-02.

Page, Post, taxonomy and native examples share one menu and Sidebar state.
Only the authored Contact and announcement examples explicitly omit it.
These checks do not define visual geometry or screenshot baselines.
"""

import os
import unittest
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")


class DemoNavigation(unittest.TestCase):
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
        expect(self.page.locator('[data-moo-document-owner][data-moo-state="ready"]')).to_have_count(1)
        expect(self.page.locator("main")).to_have_count(1)
        return self.page.locator('[data-slot="sidebar-content"]')

    def menu(self):
        return self.page.locator('[data-slot="sidebar-content"]').evaluate("""navigation => ({
            groups: Array.from(navigation.querySelectorAll('button[data-bs-toggle="collapse"]'),
                button => button.getAttribute('aria-label')),
            links: Array.from(navigation.querySelectorAll('a[data-slot="sidebar-menu-button"]'),
                link => ({
                    title: link.querySelector('.sidebar-menu-button__title').textContent.trim(),
                    href: link.getAttribute('href')
                }))
        })""")

    def test_every_linked_example_retains_the_same_locale_menu(self):
        for start, locale, exceptions in [
            ("/", "en", {"/contact", "/posts/announcement"}),
            ("/de/einrichtung", "de", {"/de/kontakt", "/de/posts/ankuendigung"}),
        ]:
            self.open_page(start)
            expected = self.menu()
            paths = sorted({urlsplit(link["href"]).path for link in expected["links"]})
            self.assertGreater(len(expected["groups"]), 1)
            self.assertTrue(exceptions.issubset(paths))
            for path in paths:
                with self.subTest(path=path, locale=locale):
                    self.open_page(path)
                    expect(self.page.locator("html")).to_have_attribute("lang", locale)
                    sidebars = 0 if path in exceptions else 1
                    expect(self.page.locator('[data-slot="sidebar"]')).to_have_count(sidebars)
                    expect(self.page.locator('header [data-sidebar-trigger]')).to_have_count(sidebars)
                    if sidebars:
                        self.assertEqual(self.menu(), expected)
                        active = self.page.locator('[data-slot="sidebar-content"] a[aria-current="page"]')
                        expect(active).to_have_count(1)
                        expect(active).to_have_attribute("href", path)

    def test_sidebar_collapse_choice_survives_real_post_and_taxonomy_navigation(self):
        navigation = self.open_page("/")
        self.page.locator('header [data-sidebar-trigger]').click()
        wrapper = self.page.locator('[data-slot="sidebar-wrapper"]')
        expect(wrapper).to_have_attribute("data-sidebar-state", "collapsed")
        navigation.get_by_role("button", name="Posts", exact=True).click()
        self.page.locator('[data-sidebar-flyout]').get_by_role("link", name="Post archive", exact=True).click()
        self.page.wait_for_url("**/posts")
        expect(wrapper).to_have_attribute("data-sidebar-state", "collapsed")
        self.page.locator('[data-slot="sidebar-content"]').get_by_role("button", name="Taxonomies", exact=True).click()
        self.page.locator('[data-sidebar-flyout]').get_by_role("link", name="Category · descendants", exact=True).click()
        self.page.wait_for_url("**/topics/category/guides")
        expect(wrapper).to_have_attribute("data-sidebar-state", "collapsed")

    def test_main_locale_sources_keep_their_folder_without_prefixing_urls(self):
        context_response = self.page.request.get(urljoin(BASE_URL, "preview/site-context.json"))
        self.assertEqual(context_response.status, 200)
        context = context_response.json()
        main_locale = context["i18n"]["defaultLocale"]
        self.assertEqual(context["site"]["defaults"]["lang"], main_locale)
        self.assertFalse(context["i18n"]["prefixDefaultLocale"])
        self.assertEqual(context["contactHref"], "/contact")

        data_response = self.page.request.get(urljoin(BASE_URL, "preview/page-data.json"))
        self.assertEqual(data_response.status, 200)
        data = data_response.json()
        self.assertEqual(data["lang"], main_locale)
        self.assertGreater(len(data["publishedIds"]), 1)
        for source_id, file_path in zip(data["publishedIds"], data["filePaths"]):
            with self.subTest(source_id=source_id):
                self.assertTrue(source_id.startswith(main_locale + "/"), source_id)
                self.assertTrue(file_path.endswith("content/page/" + source_id), file_path)
        self.assertEqual({item["id"] for item in data["paths"]}, set(data["publishedIds"]))
        paths = {item["id"]: item["slug"] for item in data["paths"]}
        self.assertIn(main_locale + "/contact.md", paths)
        self.assertEqual(paths[main_locale + "/contact.md"], "contact")


if __name__ == "__main__":
    unittest.main()
