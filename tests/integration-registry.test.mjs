import assert from "node:assert/strict";
import test from "node:test";

import { buildRegistry, validateResolvedRoutes } from "../src/integration/registry.js";
import { definePlugin } from "../src/plugins/index.js";
import { page } from "../src/plugins/page/index.js";
import moo from "../src/integration/index.js";

function external(id, basePath, { collection = id, type = id } = {}) {
  return definePlugin({
    apiVersion: 1,
    id,
    label: id,
    basePath,
    contentTypes: [{
      id: type, collection, singleRoute: "single",
      source: { kind: "json-directory", base: new URL("./fixtures/consumer/src/content/page/", import.meta.url) },
    }],
    routes: [{
      id: "single", pattern: "/[...slug]", prerender: true,
      entrypoint: new URL("./fixtures/consumer/src/pages/index.astro", import.meta.url),
    }],
  });
}

test("registry records one owner for each active type, collection, and final route", () => {
  const registry = buildRegistry([page(), external("sample", "/sample")]);
  assert.deepEqual(registry.routes.map(({ owner, pattern }) => ({ owner, pattern })), [
    { owner: "page", pattern: "/[...slug]" },
    { owner: "sample", pattern: "/sample/[...slug]" },
  ]);
  assert.deepEqual(registry.contentTypes.map(({ owner, id, collection }) => ({ owner, id, collection })), [
    { owner: "page", id: "page", collection: "page" },
    { owner: "sample", id: "sample", collection: "sample" },
  ]);
});

test("registry rejects cross-plugin collection, type, and namespace conflicts", () => {
  assert.throws(() => buildRegistry([page(), external("sample", "/sample", { collection: "page" })]), /collection page.*page.*sample/i);
  assert.throws(() => buildRegistry([external("sample", "/sample", { type: "shared" }), external("other", "/other", { type: "shared" })]), /type shared.*sample.*other/i);
  assert.throws(() => buildRegistry([page(), external("sample", "/sample"), external("nested", "/sample/nested")]), /namespace.*sample.*nested/i);
});

test("resolved routes require their one declared project or integration owner", () => {
  const injected = buildRegistry([page()]);
  const externalRoute = { pattern: "/[...slug]", origin: "external", isPrerendered: true };
  assert.doesNotThrow(() => validateResolvedRoutes(injected, [externalRoute]));
  assert.throws(() => validateResolvedRoutes(injected, [externalRoute, { ...externalRoute, origin: "project" }]), /page.*\/\[\.\.\.slug\].*multiple/i);
  assert.throws(() => validateResolvedRoutes(injected, [{ ...externalRoute, isPrerendered: false }]), /page.*prerender/i);

  const host = buildRegistry([page({ routes: { single: "host" } })]);
  assert.deepEqual(host.routes, []);
  assert.doesNotThrow(() => validateResolvedRoutes(host, [{ ...externalRoute, origin: "project" }]));
  assert.throws(() => validateResolvedRoutes(host, [externalRoute]), /page.*project.*\/\[\.\.\.slug\]/i);
  assert.throws(() => validateResolvedRoutes(host, []), /page.*project.*\/\[\.\.\.slug\]/i);
});

test("the Page integration registers a private pre-middleware only for development", () => {
  for (const command of ["dev", "build"]) {
    const middleware = [];
    moo().hooks["astro:config:setup"]({
      command,
      injectRoute() {},
      updateConfig() {},
      addMiddleware(value) { middleware.push(value); },
    });
    assert.equal(middleware.length, command === "dev" ? 1 : 0);
    if (command === "dev") {
      assert.equal(middleware[0].order, "pre");
      assert.match(middleware[0].entrypoint.href, /\/src\/integration\/middleware\.js$/);
    }
  }
});
