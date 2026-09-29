import assert from "node:assert/strict";
import test from "node:test";

import { definePlugin } from "../src/plugins/index.js";

function descriptor(changes = {}) {
  return {
    apiVersion: 1,
    id: "sample",
    label: "Sample",
    basePath: "/sample",
    contentTypes: [{
      id: "sample-entry", collection: "sample-entry", singleRoute: "single",
      source: { kind: "markdown", formats: ["md"] },
    }],
    routes: [{
      id: "single", pattern: "/[...slug]", prerender: true,
      entrypoint: new URL("./fixtures/consumer/src/pages/index.astro", import.meta.url),
    }],
    navigation: [{ label: "Sample", path: "/sample", match: "prefix" }],
    ...changes,
  };
}

test("plugin definition is pure, immutable, and owns URL and nested input data", () => {
  const input = descriptor();
  const entrypoint = input.routes[0].entrypoint.href;
  const plugin = definePlugin(input);
  assert.equal(plugin.apiVersion, 1);
  assert.equal(plugin.id, "sample");
  assert.equal(plugin.basePath, "/sample");
  assert.equal(plugin.routes[0].owner, "plugin");
  assert.equal(plugin.routes[0].entrypoint, entrypoint);
  assert.equal(plugin.contentTypes[0].source.kind, "markdown");
  assert.equal(plugin.navigation[0].match, "prefix");
  assert.ok(Object.isFrozen(plugin));
  assert.ok(Object.isFrozen(plugin.routes[0]));
  assert.ok(Object.isFrozen(plugin.contentTypes[0].source.formats));
  input.label = "Changed";
  input.routes[0].entrypoint.pathname = "/elsewhere.astro";
  input.contentTypes[0].source.formats.push("mdx");
  input.navigation[0].label = "Changed";
  assert.equal(plugin.label, "Sample");
  assert.equal(plugin.routes[0].entrypoint, entrypoint);
  assert.deepEqual(plugin.contentTypes[0].source.formats, ["md"]);
  assert.equal(plugin.navigation[0].label, "Sample");
});

test("plugin version, ids, labels, and namespaces have field-specific failures", () => {
  assert.throws(() => definePlugin(descriptor({ apiVersion: 2 })), /apiVersion.*1/);
  assert.throws(() => definePlugin(descriptor({ id: "Sample" })), /id/);
  assert.throws(() => definePlugin(descriptor({ label: " " })), /label/);
  assert.throws(() => definePlugin(descriptor({ extra: "custom" })), /extra/);
  for (const basePath of ["/", "/Aktuelles", "/network team", "/küche", "/sample/../other", "/sample/%2fsecret", "/_astro", "/__moo_content_integrity", "javascript:alert(1)"]) {
    assert.throws(() => definePlugin(descriptor({ basePath })), /basePath/, basePath);
  }
  assert.equal(definePlugin(descriptor({ basePath: "/aktuelles/", navigation: [{ label: "Aktuelles", path: "/aktuelles" }] })).basePath, "/aktuelles");
  assert.equal(definePlugin(descriptor({ id: "page", basePath: "/", contentTypes: [{ ...descriptor().contentTypes[0], id: "page", collection: "page" }] })).basePath, "/");
  assert.throws(() => definePlugin(descriptor({ id: "page", basePath: "/pages" })), /basePath/);
});

test("route ownership is closed, local ids are unique, and Single maps to a literal catchall", () => {
  const host = descriptor({ routes: [{ id: "single", owner: "host", pattern: "/[...slug]", prerender: true }] });
  assert.equal(definePlugin(host).routes[0].owner, "host");
  assert.equal(definePlugin(descriptor()).routes[0].id, definePlugin(descriptor({ id: "another", basePath: "/another", navigation: [] })).routes[0].id);
  assert.throws(() => definePlugin(descriptor({ routes: [{ id: "single", owner: "host", pattern: "/[...slug]", prerender: true, entrypoint: new URL("file:///tmp/route.astro") }] })), /entrypoint/);
  assert.throws(() => definePlugin(descriptor({ routes: [{ id: "single", pattern: "/[...slug]", prerender: true }] })), /entrypoint/);
  assert.throws(() => definePlugin(descriptor({ routes: [{ id: "single", pattern: "/[...slug]", prerender: false, entrypoint: new URL("file:///tmp/route.astro") }] })), /prerender/);
  assert.throws(() => definePlugin(descriptor({ routes: [{ id: "single", pattern: "/[...slug]", prerender: true, entrypoint: new URL("https://example.test/route") }] })), /entrypoint/);
  assert.throws(() => definePlugin(descriptor({ routes: [descriptor().routes[0], { ...descriptor().routes[0] }] })), /routes.*id/);
  assert.throws(() => definePlugin(descriptor({ routes: [descriptor().routes[0], { ...descriptor().routes[0], id: "copy" }] })), /routes.*pattern/);
  assert.throws(() => definePlugin(descriptor({ routes: [{ ...descriptor().routes[0], pattern: "/single/[slug]" }] })), /singleRoute|catchall/);
  assert.throws(() => definePlugin(descriptor({ routes: [{ ...descriptor().routes[0], pattern: "/../outside/[...slug]" }] })), /pattern/);
  assert.throws(() => definePlugin(descriptor({ routes: [{ ...descriptor().routes[0], pattern: "/safe/%2f/[...slug]" }] })), /pattern/);
  assert.throws(() => definePlugin(descriptor({ routes: [{ ...descriptor().routes[0], pattern: "/Upper/[...slug]" }] })), /pattern/);
  assert.equal(definePlugin(descriptor({ routes: [{ ...descriptor().routes[0], pattern: "/topic/[...slug]" }] })).routes[0].pattern, "/topic/[...slug]");
  assert.throws(() => definePlugin(descriptor({ routes: [{ ...descriptor().routes[0], pattern: "/[lang]/[...slug]" }] })), /singleRoute|literal/);
});

test("content types declare supported sources and unambiguous Single and taxonomy bindings", () => {
  const type = descriptor().contentTypes[0];
  assert.throws(() => definePlugin(descriptor({ contentTypes: [] })), /contentTypes/);
  assert.throws(() => definePlugin(descriptor({ routes: [] })), /routes/);
  assert.throws(() => definePlugin(descriptor({ contentTypes: [type, { ...type }] })), /contentTypes.*id/);
  assert.throws(() => definePlugin(descriptor({ contentTypes: [{ ...type, singleRoute: "missing" }] })), /singleRoute/);
  assert.throws(() => definePlugin(descriptor({ contentTypes: [{ ...type, source: { kind: "markdown", formats: ["mdx"] } }] })), /formats/);
  assert.throws(() => definePlugin(descriptor({ contentTypes: [{ ...type, source: { kind: "json", file: new URL("https://example.test/entries.json") } }] })), /source.*file/);
  assert.throws(() => definePlugin(descriptor({ contentTypes: [{ ...type, source: { kind: "json-directory", base: new URL("file:///tmp/entries.json") } }] })), /source.*base/);
  assert.throws(() => definePlugin(descriptor({ contentTypes: [{ ...type, taxonomies: ["category", "category"] }] })), /taxonomies/);
  assert.throws(() => definePlugin(descriptor({ contentTypes: [{ ...type, id: "page", collection: "articles" }] })), /collection/);
  const source = new URL("file:///tmp/entries.json");
  const plugin = definePlugin(descriptor({ contentTypes: [{ ...type, source: { kind: "json", file: source }, taxonomies: ["category"] }] }));
  source.pathname = "/tmp/other.json";
  assert.equal(plugin.contentTypes[0].source.file, "file:///tmp/entries.json");
  assert.deepEqual(plugin.contentTypes[0].taxonomies, ["category"]);
});

test("navigation paths are canonical, safe, and inside the plugin namespace", () => {
  for (const path of ["javascript:alert(1)", "/sample-other", "/Sample", "/sample/%2f", "/sample/../outside", "/sample?x", "data:text/html,hi"]) {
    assert.throws(() => definePlugin(descriptor({ navigation: [{ label: "Sample", path }] })), /navigation.*path/, path);
  }
  assert.equal(definePlugin(descriptor({ navigation: [{ label: "Sample", path: "/sample" }] })).navigation[0].match, "exact");
  assert.throws(() => definePlugin(descriptor({ navigation: [{ label: "Sample", path: "/sample", match: "contains" }] })), /match/);
});

test("plugin resolves through its exact public package entrypoint", async () => {
  const publicPlugin = await import("@wpmoo/astro/plugins");
  assert.equal(publicPlugin.definePlugin, definePlugin);
});
