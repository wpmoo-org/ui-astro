import assert from "node:assert/strict";
import test from "node:test";

import { siteHref } from "../src/content/paths.js";

test("canonical local paths follow the host base and trailing slash policy", () => {
  assert.equal(siteHref("/", { base: "/", trailingSlash: "ignore" }), "/");
  assert.equal(siteHref("/about", { base: "/", trailingSlash: "always" }), "/about/");
  assert.equal(siteHref("/about", { base: "/", trailingSlash: "never" }), "/about");
  assert.equal(siteHref("/", { base: "/docs", trailingSlash: "always" }), "/docs/");
  assert.equal(siteHref("/", { base: "/docs", trailingSlash: "never" }), "/docs");
  assert.equal(siteHref("/guide/setup", { base: "/docs", trailingSlash: "always" }), "/docs/guide/setup/");
  assert.equal(siteHref("/guide/setup", { base: "/docs/", trailingSlash: "ignore" }), "/docs/guide/setup");
});

test("href mapping rejects unsafe or noncanonical host and content paths", () => {
  for (const local of ["about", "/About", "/about?draft=1", "/about/../admin", "//evil.test"]) {
    assert.throws(() => siteHref(local, { base: "/", trailingSlash: "ignore" }), /path|canonical/i, local);
  }
  assert.throws(() => siteHref("/about", { base: "/Docs", trailingSlash: "ignore" }), /base|canonical/i);
  assert.throws(() => siteHref("/about", { base: "/", trailingSlash: "sometimes" }), /trailingSlash/i);
});
