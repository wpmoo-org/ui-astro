"""Positive contracts for the accepted MDX and native Astro examples.

Accepted on 2026-10-02 at desktop light/LTR and narrow dark/RTL. These
protect the shared host Hero, document ownership and working navigation.
"""

import os
import unittest
from urllib.parse import urljoin

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/")
PROFILES = [(1876, "light", "ltr"), (390, "dark", "rtl")]


class AcceptedMixedPages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def open_profile(self, width, theme, direction, path):
        context = self.browser.new_context(viewport={"width": width, "height": 844})
        self.addCleanup(context.close)
        context.add_init_script(
            f"localStorage.setItem('moo:theme', '{theme}'); "
            f"localStorage.setItem('moo:direction', '{direction}')"
        )
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        self.assertEqual(page.goto(urljoin(BASE_URL, path), wait_until="domcontentloaded").status, 200)
        self.assert_shell(page, width, theme, direction)
        return page, errors

    def assert_shell(self, page, width, theme, direction):
        owner = page.locator('[data-moo-document-owner][data-moo-state="ready"]')
        expect(owner).to_have_count(1)
        expect(owner).to_have_attribute("data-bs-theme", theme)
        expect(page.locator("html")).to_have_attribute("dir", direction)
        expect(page.locator("html")).to_have_attribute("lang", "en")
        expect(page.locator("main")).to_have_count(1)
        expect(page.locator("main h1")).to_have_count(1)
        expect(page.locator('main > [data-page-container]')).to_have_count(1)
        self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), width)

    def assert_hero(self, page, heading, title):
        hero = page.get_by_role("region", name=title, exact=True)
        expect(hero).to_be_visible()
        expect(hero).to_have_attribute("data-host-section", "hero")
        expect(hero).to_have_attribute("aria-labelledby", heading)
        expect(hero.locator("h2")).to_have_attribute("id", heading)
        expect(hero.locator("h2")).to_have_text(title)
        hero_box = hero.bounding_box()
        rail_box = page.locator('main > [data-page-container]').bounding_box()
        self.assertGreater(hero_box["width"], 0)
        self.assertGreater(hero_box["y"], page.locator("main h1").bounding_box()["y"])
        self.assertGreaterEqual(hero_box["x"], rail_box["x"] - 1)
        self.assertLessEqual(hero_box["x"] + hero_box["width"], rail_box["x"] + rail_box["width"] + 1)

    def test_mdx_hero_uses_the_collection_shell_and_accessible_mobile_sidebar(self):
        for width, theme, direction in PROFILES:
            with self.subTest(width=width, theme=theme, direction=direction):
                page, errors = self.open_profile(width, theme, direction, "enhanced-page")
                expect(page.locator("main h1")).to_have_text("Enhanced Page")
                expect(page.locator("main article.page.page-id--enhanced-page_002e_mdx")).to_have_count(1)
                self.assert_hero(page, "mdx-example-heading", "Reusable MDX Hero")
                action = page.get_by_role("button", name="Open native Astro page", exact=True)
                expect(action).to_be_visible()
                expect(action).to_have_attribute("href", "/landing")
                trigger = page.locator("[data-sidebar-trigger]")
                sidebar = page.locator('[data-slot="sidebar"]')
                expect(trigger).to_have_attribute("aria-controls", sidebar.get_attribute("id"))
                if width == 390:
                    expect(sidebar).to_be_hidden()
                    expect(trigger).to_have_attribute("aria-expanded", "false")
                    trigger.focus()
                    self.assertTrue(trigger.evaluate("element => element.matches(':focus-visible')"))
                    page.keyboard.press("Enter")
                    expect(sidebar).to_be_visible()
                    expect(sidebar).to_have_attribute("role", "dialog")
                    expect(sidebar).to_have_attribute("aria-modal", "true")
                    expect(trigger).to_have_attribute("aria-expanded", "true")
                    page.keyboard.press("Escape")
                    expect(sidebar).to_be_hidden()
                    expect(trigger).to_have_attribute("aria-expanded", "false")
                    expect(trigger).to_be_focused()
                else:
                    expect(sidebar).to_be_visible()
                self.assertEqual(errors, [])

    def test_native_hero_and_reciprocal_actions_keep_the_selected_shell_preferences(self):
        for width, theme, direction in PROFILES:
            with self.subTest(width=width, theme=theme, direction=direction):
                page, errors = self.open_profile(width, theme, direction, "landing")
                expect(page.locator("main h1")).to_have_text("Native Astro page")
                expect(page.locator('.moo-ui.page.route-mdx-landing')).to_have_count(1)
                self.assert_hero(page, "native-example-heading", "Reusable Astro Hero")
                self.assertEqual(page.locator('[data-slot="sidebar"]').count(), 0)
                action = page.get_by_role("button", name="Open MDX Page", exact=True)
                expect(action).to_have_attribute("href", "/enhanced-page")
                action.click()
                expect(page).to_have_url(urljoin(BASE_URL, "enhanced-page"))
                self.assert_shell(page, width, theme, direction)
                self.assert_hero(page, "mdx-example-heading", "Reusable MDX Hero")
                page.get_by_role("button", name="Open native Astro page", exact=True).click()
                expect(page).to_have_url(urljoin(BASE_URL, "landing"))
                self.assert_shell(page, width, theme, direction)
                self.assert_hero(page, "native-example-heading", "Reusable Astro Hero")
                self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
