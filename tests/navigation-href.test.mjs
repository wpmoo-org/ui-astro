import assert from "node:assert/strict";
import test from "node:test";

import { navigationHref } from "../src/internal/href.js";

test("semantic links retain supported local and contact destinations", () => {
  for (const href of ["/", "/docs/start", "guide/start", "../parent", "#details", "?tab=1", "https://example.test/path", "http://example.test/", "mailto:hello@example.test", "tel:+491234567"]) {
    assert.equal(navigationHref(href, "item.href"), href);
  }
});

test("navigation rejects unsafe or disguised schemes with the owning field", () => {
  for (const href of ["", "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\nscript:alert(1)", "data:text/html,hi", "vbscript:msgbox(1)", "file:///etc/passwd", "//evil.test/path", "\\evil.test", "foo:bar", "/path\u0000bad"]) {
    assert.throws(() => navigationHref(href, "item.href"), /item\.href/, href);
  }
});
