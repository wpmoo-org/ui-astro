"""Exercise the public Sidebar submenu from an installed, built UI-only consumer."""

import mimetypes
import sys
import unittest
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import expect, sync_playwright


DIST = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
if DIST:
    del sys.argv[1]


class PackedSidebar(unittest.TestCase):
    def test_native_disclosure_is_available_without_content_integration(self):
        self.assertIsNotNone(DIST, "pass the packed UI-only dist directory")
        playwright = sync_playwright().start()
        self.addCleanup(playwright.stop)
        browser = playwright.chromium.launch(headless=True)
        self.addCleanup(browser.close)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def serve(route):
            path = unquote(urlparse(route.request.url).path).lstrip("/") or "index.html"
            target = (DIST / path).resolve()
            if not target.is_relative_to(DIST) or not target.is_file():
                route.fulfill(status=404, body="missing")
                return
            route.fulfill(path=str(target), content_type=mimetypes.guess_type(str(target))[0] or "application/octet-stream")

        page.route("http://packed-sidebar.invalid/**", serve)
        self.assertEqual(page.goto("http://packed-sidebar.invalid/", wait_until="networkidle").status, 200)
        page.locator('[data-moo-document-owner][data-moo-state="ready"]').wait_for()
        trigger = page.get_by_role("button", name="Content", exact=True)
        expect(trigger).to_have_attribute("aria-expanded", "true")
        submenu = page.locator(f'#{trigger.get_attribute("aria-controls")}')
        active = submenu.get_by_role("link", name="Supplied content", exact=True)
        expect(active).to_have_attribute("aria-current", "page")
        expect(active).to_have_attribute("href", "#supplied-item")
        trigger.focus()
        page.keyboard.press("Enter")
        expect(active).to_be_hidden()
        expect(trigger).to_have_attribute("aria-expanded", "false")
        page.keyboard.press("Space")
        expect(active).to_be_visible()
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
