"""Positive contracts for the editorial/Empty appearance accepted on 2026-10-18.

ASTRO_BASE_URL may name the ordinary demo or a built demo under a host base.
The assertions protect visible geometry and authored media, not screenshot pixels.
"""

from contextlib import contextmanager
import os
import unittest
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:4322/").rstrip("/") + "/"


class AcceptedEditorialViews(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    @contextmanager
    def profile(self, width, theme, direction):
        context = self.browser.new_context(viewport={"width": width, "height": 900})
        context.add_init_script(
            f"localStorage.setItem('moo:theme', '{theme}');"
            f"localStorage.setItem('moo:direction', '{direction}');"
        )
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            yield page
            self.assertEqual(errors, [])
            expect(page.locator('[data-moo-document-owner]')).to_have_attribute("data-bs-theme", theme)
            expect(page.locator("html")).to_have_attribute("dir", direction)
            self.assertFalse(page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        finally:
            context.close()

    def open_page(self, page, path, locale):
        response = page.goto(urljoin(BASE_URL, path), wait_until="domcontentloaded")
        self.assertEqual(response.status, 200)
        expect(page.locator("html")).to_have_attribute("lang", locale)
        expect(page.locator('[data-moo-document-owner][data-moo-state="ready"]')).to_be_visible()
        expect(page.locator("main h1")).to_have_count(1)

    def loaded_cover(self, page, selector):
        image = page.locator(selector)
        expect(image).to_have_count(1)
        expect(image).to_be_visible()
        expect(image).to_have_js_property("complete", True)
        expect(image).to_have_js_property("naturalWidth", 1200)
        self.assertEqual(urlsplit(image.get_attribute("src")).path,
                         urlsplit(urljoin(BASE_URL, "images/reading-landscape.png")).path)
        self.assertEqual(image.get_attribute("width"), "1200")
        self.assertEqual(image.get_attribute("height"), "675")
        return image

    def test_archive_media_stacks_until_the_page_rail_is_wide_enough(self):
        for locale, prefix in (("en", ""), ("de", "de/")):
            for width in (390, 768, 1440):
                for theme in ("light", "dark"):
                    for direction in ("ltr", "rtl"):
                        with self.subTest(locale=locale, width=width, theme=theme, direction=direction):
                            with self.profile(width, theme, direction) as page:
                                self.open_page(page, prefix + "posts", locale)
                                image = self.loaded_cover(page, "main li.post img")
                                item = page.locator("main li.post").filter(has=page.locator("img"))
                                heading = item.locator("h2")
                                date = item.locator("time")
                                image_box = image.bounding_box()
                                title_box = heading.bounding_box()
                                self.assertLess(date.bounding_box()["y"], title_box["y"])
                                if width < 1440:
                                    self.assertGreaterEqual(
                                        date.bounding_box()["y"],
                                        image_box["y"] + image_box["height"] - 1,
                                    )
                                    self.assertAlmostEqual(title_box["width"], image_box["width"], delta=1)
                                else:
                                    self.assertLess(title_box["y"], image_box["y"] + image_box["height"])
                                    self.assertGreater(title_box["width"], image_box["width"])
                                    self.assertAlmostEqual(image_box["width"] / title_box["width"], 5 / 7, delta=0.08)
                                    if direction == "ltr":
                                        self.assertGreaterEqual(title_box["x"], image_box["x"] + image_box["width"])
                                    else:
                                        self.assertGreaterEqual(image_box["x"], title_box["x"] + title_box["width"])
                                if locale == "en":
                                    href = urlsplit(urljoin(BASE_URL, "posts/announcement")).path
                                    plain = page.locator("main li.post").filter(
                                        has=page.locator(f'h2 a[href="{href}"]')
                                    )
                                    expect(plain).to_have_count(1)
                                    expect(plain.locator("img")).to_have_count(0)
                                    self.assertGreater(plain.locator("h2").bounding_box()["width"],
                                                       plain.bounding_box()["width"] * 0.95)

    def test_archive_reflows_when_sidebar_changes_the_available_rail(self):
        with self.profile(1200, "dark", "ltr") as page:
            self.open_page(page, "posts", "en")
            wrapper = page.locator('[data-slot="sidebar-wrapper"][data-sidebar-ready]')
            expect(wrapper).to_have_attribute("data-sidebar-state", "expanded")
            image = self.loaded_cover(page, "main li.post img")
            heading = page.locator("main li.post").filter(has=page.locator("img")).locator("h2")
            self.assertGreater(heading.bounding_box()["y"], image.bounding_box()["y"] + image.bounding_box()["height"])
            page.locator("[data-sidebar-trigger]").click()
            expect(wrapper).to_have_attribute("data-sidebar-state", "collapsed")
            page.wait_for_function("""() => {
                const image = document.querySelector('main li.post img');
                const heading = image.closest('li').querySelector('h2');
                return heading.getBoundingClientRect().top < image.getBoundingClientRect().bottom
                    && heading.getBoundingClientRect().width > image.getBoundingClientRect().width;
            }""")
            page.locator("[data-sidebar-trigger]").click()
            expect(wrapper).to_have_attribute("data-sidebar-state", "expanded")
            page.wait_for_function("""() => {
                const image = document.querySelector('main li.post img');
                return image.closest('li').querySelector('time').getBoundingClientRect().top
                    >= image.getBoundingClientRect().bottom;
            }""")
            self.assertEqual(page.viewport_size["width"], 1200)

    def test_single_uses_explicit_localized_covers_without_translation_fallback(self):
        paths = (
            ("en", "posts/layout-options", "Layered mountain silhouettes beneath a soft blue sky."),
            ("de", "de/posts/ankuendigung", "Gestaffelte Bergsilhouetten unter einem sanft blauen Himmel."),
        )
        for width in (390, 1440):
            for theme, direction in (("light", "ltr"), ("dark", "rtl")):
                with self.subTest(width=width, theme=theme, direction=direction):
                    with self.profile(width, theme, direction) as page:
                        for locale, path, alt in paths:
                            self.open_page(page, path, locale)
                            image = self.loaded_cover(page, "main article img")
                            expect(image).to_have_attribute("alt", alt)
                            heading = page.locator("main h1")
                            self.assertIn(heading.evaluate("e => getComputedStyle(e).textAlign"),
                                          ("start", "right" if direction == "rtl" else "left"))
                            article_box = page.locator("main article").bounding_box()
                            image_box = image.bounding_box()
                            self.assertAlmostEqual(image_box["x"] + image_box["width"] / 2,
                                                   article_box["x"] + article_box["width"] / 2, delta=1)
                            prose = page.locator("main article p").last
                            self.assertGreater(prose.bounding_box()["y"], image_box["y"] + image_box["height"])
                        self.open_page(page, "posts/announcement", "en")
                        expect(page.locator("main article img")).to_have_count(0)

    def test_authored_article_links_keep_the_host_base_and_reach_native_headings(self):
        with self.profile(390, "light", "ltr") as page:
            path = "posts/layout-options"
            self.open_page(page, path, "en")
            document_url = page.url.split("#", 1)[0]
            self.assertEqual(urlsplit(document_url).path.rstrip("/"),
                             urlsplit(urljoin(BASE_URL, path)).path.rstrip("/"))
            for heading_id in ("keep-layout-choices-independent", "check-the-narrow-layout-first"):
                link = page.locator(f'main article a[href="#{heading_id}"]')
                target = page.locator(f'main article h2[id="{heading_id}"]')
                expect(link).to_have_count(1)
                expect(target).to_have_count(1)
                link.click()
                expect(page).to_have_url(document_url + "#" + heading_id)
                expect(target).to_be_in_viewport()

    def test_localized_empty_surfaces_and_taxonomy_breadcrumbs(self):
        for locale, prefix, copy in (("en", "", "No items yet."), ("de", "de/", "Noch keine Einträge.")):
            for width in (390, 1440):
                for theme, direction in (("light", "rtl"), ("dark", "ltr")):
                    with self.subTest(locale=locale, width=width, theme=theme, direction=direction):
                        with self.profile(width, theme, direction) as page:
                            self.open_page(page, prefix + "topics/tag/empty", locale)
                            state = page.locator("main .empty-state")
                            expect(state).to_have_count(1)
                            expect(state).to_be_visible()
                            expect(state.get_by_role("heading")).to_have_text(copy)
                            box = state.bounding_box()
                            title_box = state.get_by_role("heading").bounding_box()
                            self.assertAlmostEqual(title_box["x"] + title_box["width"] / 2,
                                                   box["x"] + box["width"] / 2, delta=1)
                            self.assertGreaterEqual(title_box["x"], box["x"])
                            self.assertLessEqual(title_box["x"] + title_box["width"], box["x"] + box["width"])
        with self.profile(1440, "dark", "ltr") as page:
            for path, label in (("category/layouts", "Kategorien: Layouts"),
                                ("tag/empty", "Schlagwörter: Leeres Schlagwort"),
                                ("sector/foundation", "Bereiche: Grundlagen")):
                self.open_page(page, "de/topics/" + path, "de")
                breadcrumb = page.get_by_role("navigation", name="Navigationspfad", exact=True)
                expect(breadcrumb.get_by_text(label, exact=True)).to_be_visible()


if __name__ == "__main__":
    unittest.main()
