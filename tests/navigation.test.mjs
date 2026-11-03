import assert from "node:assert/strict";
import test from "node:test";

import { navigationFromPages, navigationFromDescriptors, pageNavigationOrders, sortNavigation } from "../packages/astro/src/integration/navigation.js";

const page = (id, status, data = {}) => ({ collection: "page", id, data: { title: id, status, ...data } });

test("declared archive navigation uses its host mount and an exact namespace boundary", () => {
  const declared = [{ label: "News", path: "/news", match: "prefix" }];
  assert.deepEqual(navigationFromDescriptors(declared, "/docs/news/first/", { base: "/docs", trailingSlash: "always" }),
    [{ label: "News", href: "/docs/news/", active: true }]);
  assert.deepEqual(navigationFromDescriptors(declared, "/docs/news-other", { base: "/docs", trailingSlash: "never" }),
    [{ label: "News", href: "/docs/news", active: false }]);
});

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

test("ordered plugin items interleave with pages; unordered items keep their sequence", () => {
  const items = ["About", "Contact", "Archive", "News", "Jobs"];
  assert.deepEqual(sortNavigation(items, [2, undefined, 1, undefined, 3]), ["Archive", "About", "Jobs", "Contact", "News"]);
  assert.deepEqual(sortNavigation(items, []), items);
});

test("page navigation orders follow the rendered page sequence", () => {
  const pages = [
    page("b.md", "publish", { title: "B", navOrder: 5 }),
    page("a.md", "publish", { title: "A" }),
    page("c.md", "publish", { title: "C", navOrder: 2 }),
  ];
  const options = { lang: "en", base: "/", trailingSlash: "ignore" };
  assert.deepEqual(navigationFromPages(pages, "/", options).map((item) => item.label), ["C", "B", "A"]);
  assert.deepEqual(pageNavigationOrders(pages, options), [2, 5, undefined]);
});
