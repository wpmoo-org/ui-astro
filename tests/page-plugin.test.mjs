import assert from "node:assert/strict";
import test from "node:test";

import { page } from "../packages/astro/src/plugins/page/index.js";

test("Page factory owns one content type and one static Single route", () => {
  const plugin = page();
  assert.equal(plugin.id, "page");
  assert.equal(plugin.label, "Pages");
  assert.equal(plugin.basePath, "/");
  assert.deepEqual(plugin.contentTypes.map(({ id, collection, singleRoute, source }) => [id, collection, singleRoute, source.kind, source.formats]), [
    ["page", "page", "single", "markdown", ["md"]],
  ]);
  assert.deepEqual(plugin.routes.map(({ id, pattern, owner, prerender }) => [id, pattern, owner, prerender]), [
    ["single", "/[...slug]", "plugin", true],
  ]);
  assert.equal(plugin.routes[0].entrypoint.endsWith("/src/plugins/page/routes/[...slug].astro"), true);
  assert.ok(Object.isFrozen(plugin));
});

test("Page source, formats, taxonomy bindings and host ownership are explicit immutable options", () => {
  const source = new URL("../content/page/", import.meta.url);
  const input = { source, formats: ["md", "mdx"], taxonomies: ["category"], routes: { single: "host" } };
  const plugin = page(input);
  assert.equal(plugin.contentTypes[0].source.base, source.href);
  assert.deepEqual(plugin.contentTypes[0].source.formats, ["md", "mdx"]);
  assert.deepEqual(plugin.contentTypes[0].taxonomies, ["category"]);
  assert.deepEqual(plugin.routes[0], { id: "single", pattern: "/[...slug]", owner: "host", prerender: true });
  input.formats.push("other");
  input.taxonomies.push("tag");
  assert.deepEqual(plugin.contentTypes[0].source.formats, ["md", "mdx"]);
  assert.deepEqual(plugin.contentTypes[0].taxonomies, ["category"]);
});

test("Page factory rejects unsupported ownership, source and option fields", () => {
  assert.throws(() => page({ routes: { single: "missing" } }), /routes\.single|owner/i);
  assert.throws(() => page({ routes: { archive: "host" } }), /routes\.archive|unsupported/i);
  assert.throws(() => page({ formats: ["mdx"] }), /formats/i);
  assert.throws(() => page({ source: new URL("https://example.test/page/") }), /source|local file/i);
  assert.throws(() => page({ component: "Page.astro" }), /component|unsupported/i);
});

test("Page factory resolves from its package export", async () => {
  const publicPage = await import("@wpmoo/astro/plugins/page");
  assert.equal(publicPage.page, page);
});
