import assert from "node:assert/strict";
import test from "node:test";

import { navigationFromPages } from "../src/integration/navigation.js";

const page = (id, status, data = {}) => ({ collection: "page", id, data: { title: id, status, ...data } });

test("Page navigation uses route hrefs, host base, order, and exact active path", () => {
  const pages = [
    page("İletişim.md", "publish", { title: "İletişim", navOrder: 2 }),
    page("index.md", "publish", { title: "Ana Sayfa", navOrder: 1, navLabel: "Başlangıç" }),
    page("draft.md", "draft", { title: "Taslak" }),
  ];
  assert.deepEqual(navigationFromPages(pages, "/docs/iletisim/", {
    lang: "tr", base: "/docs/", trailingSlash: "always",
  }), [
    { label: "Başlangıç", href: "/docs/", active: false },
    { label: "İletişim", href: "/docs/iletisim/", active: true },
  ]);
  assert.deepEqual(navigationFromPages(pages, "/docs-other", {
    lang: "tr", base: "/docs", trailingSlash: "never",
  }).map((item) => item.active), [false, false]);
  assert.deepEqual(navigationFromPages([], "/", { base: "/", trailingSlash: "ignore" }), []);
});

test("Page navigation rejects a shadowed active namespace and unsafe current path", () => {
  assert.throws(() => navigationFromPages([page("Sample/test.md", "publish")], "/sample/test", {
    lang: "en", base: "/", trailingSlash: "ignore", reservedPrefixes: ["/sample"],
  }), /reserved|namespace/i);
  assert.throws(() => navigationFromPages([], "//evil.test", { base: "/", trailingSlash: "ignore" }), /currentPath/i);
  assert.throws(() => navigationFromPages([], "/about?preview=1", { base: "/", trailingSlash: "ignore" }), /currentPath/i);
});
