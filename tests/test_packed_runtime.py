"""Run the packed consumer's built HTML and assets in Chromium without a server."""

import mimetypes
import sys
import unittest
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright


DIST = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
if DIST:
    del sys.argv[1]


class PackedConsumerRuntime(unittest.TestCase):
    def test_published_asset_graph_and_sidebar_behavior(self):
        self.assertIsNotNone(DIST, "pass the packed consumer dist directory")
        self.assertTrue((DIST / "index.html").is_file())
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page_errors = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))

            def serve(route):
                relative_path = unquote(urlparse(route.request.url).path).lstrip("/") or "index.html"
                target = (DIST / relative_path).resolve()
                if not target.is_relative_to(DIST) or not target.is_file():
                    route.fulfill(status=404, body="missing")
                    return
                content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
                route.fulfill(path=str(target), content_type=content_type)

            page.route("http://packed-consumer.invalid/**", serve)
            response = page.goto("http://packed-consumer.invalid/", wait_until="networkidle")
            self.assertEqual(response.status, 200)
            self.assertEqual(page_errors, [])
            self.assertEqual(page.locator('[data-moo-document-owner]').get_attribute("data-moo-state"), "ready")
            self.assertEqual(page.locator('[data-public-wrapper-count]').get_attribute("data-public-wrapper-count"), "45")
            self.assertEqual(page.locator("main").evaluate("e => getComputedStyle(e).overflowY"), "auto")
            trigger = page.locator('[data-sidebar-trigger]')
            trigger.click()
            sidebar = page.locator('[data-slot="sidebar"]')
            page.wait_for_function("document.querySelector('[data-slot=sidebar]').classList.contains('show')")
            self.assertEqual(sidebar.get_attribute("aria-modal"), "true")
            self.assertEqual(trigger.get_attribute("aria-expanded"), "true")
            page.keyboard.press("Escape")
            page.wait_for_function("!document.querySelector('[data-slot=sidebar]').classList.contains('show')")
            self.assertTrue(trigger.evaluate("e => document.activeElement === e"))
            checkbox = page.get_by_role("checkbox", name="Enable feature", exact=True)
            self.assertTrue(checkbox.is_checked())
            self.assertTrue(checkbox.is_disabled())
            self.assertEqual(checkbox.get_attribute("aria-describedby"), "consumer-checkbox-description")
            self.assertEqual(checkbox.get_attribute("data-caller-control"), "checkbox")
            self.assertEqual(page.locator('input[type="hidden"][name="features"]').evaluate_all("nodes => nodes.map(node => node.value)"), ["page", "post"])
            page.get_by_role("button", name="Remove Pages", exact=True).click()
            self.assertEqual(page.locator('input[type="hidden"][name="features"]').evaluate_all("nodes => nodes.map(node => node.value)"), ["post"])
            self.assertEqual(page.get_by_role("button", name="Remove Pages", exact=True).count(), 0)
            self.assertEqual(page.get_by_role("button", name="Remove Posts", exact=True).count(), 1)
            self.assertEqual(page_errors, [])
            browser.close()


if __name__ == "__main__":
    unittest.main()
