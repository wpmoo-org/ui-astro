import assert from "node:assert/strict";
import test from "node:test";
import moo from "../src/integration/index.js";
import {
  buildRegistry,
  validateResolvedRoutes,
} from "../src/integration/registry.js";
import { localizeRegistry, resolveI18n } from "../src/i18n/profile.js";
import { defineSite } from "../src/config/index.js";
import { defineTaxonomy } from "../src/taxonomies/index.js";

const taxonomy = defineTaxonomy({
  id: "category",
  label: "Categories",
  source: new URL(
    "./fixtures/taxonomy/src/data/category.json",
    import.meta.url,
  ),
  archive: {},
});
const pattern = "/topics/[taxonomy]/[slug]";
const resolved = { pattern, origin: "project", isPrerendered: true };

test("taxonomy archives retain plugin ownership unless the host explicitly selects it", () => {
  const plugin = buildRegistry([], { taxonomies: [taxonomy] });
  assert.deepEqual(plugin.routeClaims, [
    { owner: "taxonomy", pattern, routeOwner: "plugin" },
  ]);
  assert.equal(plugin.routes[0].pattern, pattern);

  const input = { taxonomies: [taxonomy], taxonomyRoutes: { archive: "host" } };
  const host = buildRegistry([], input);
  input.taxonomyRoutes.archive = "plugin";
  assert.deepEqual(host.routeClaims, [
    { owner: "taxonomy", pattern, routeOwner: "host" },
  ]);
  assert.deepEqual(host.routes, []);
  assert.deepEqual(host.taxonomies, plugin.taxonomies);
  assert.equal(host.taxonomyRoutes.archive, "host");
  assert.ok(Object.isFrozen(host.taxonomyRoutes));
});

test("host taxonomy archives require exactly one native prerendered route", () => {
  const host = buildRegistry([], {
    taxonomies: [taxonomy],
    taxonomyRoutes: { archive: "host" },
  });
  assert.doesNotThrow(() => validateResolvedRoutes(host, [resolved]));
  assert.throws(
    () => validateResolvedRoutes(host, []),
    /taxonomy.*one project route/,
  );
  assert.throws(
    () => validateResolvedRoutes(host, [{ ...resolved, origin: "external" }]),
    /taxonomy.*one project route/,
  );
  assert.throws(
    () => validateResolvedRoutes(host, [resolved, resolved]),
    /taxonomy.*multiple resolved owners/,
  );
  assert.throws(
    () => validateResolvedRoutes(host, [{ ...resolved, isPrerendered: false }]),
    /taxonomy.*must prerender/,
  );
});

test("native locale projections preserve the host taxonomy owner and canonical mount", () => {
  const registry = buildRegistry([], {
    taxonomies: [taxonomy],
    taxonomyBasePath: "/subjects",
    taxonomyRoutes: { archive: "host" },
  });
  const profile = resolveI18n(
    { locales: ["en", "de"], defaultLocale: "en" },
    defineSite(),
  );
  const localized = localizeRegistry(registry, profile);
  assert.deepEqual(localized.routes, []);
  assert.deepEqual(
    localized.routeClaims.map(({ pattern, routeOwner }) => ({
      pattern,
      routeOwner,
    })),
    [
      { pattern: "/subjects/[taxonomy]/[slug]", routeOwner: "host" },
      { pattern: "/de/subjects/[taxonomy]/[slug]", routeOwner: "host" },
    ],
  );
  assert.doesNotThrow(() =>
    validateResolvedRoutes(
      localized,
      localized.routeClaims.map(({ pattern }) => ({ ...resolved, pattern })),
    ),
  );
  assert.throws(
    () =>
      validateResolvedRoutes(localized, [
        { ...resolved, pattern: "/subjects/[taxonomy]/[slug]" },
      ]),
    /taxonomy.*\/de\/subjects/,
  );
});

test("the integration activates host taxonomy metadata without injecting its archive", () => {
  const patterns = [];
  const integration = moo({
    plugins: [],
    taxonomies: [taxonomy],
    taxonomyRoutes: { archive: "host" },
  });
  integration.hooks["astro:config:setup"]({
    command: "build",
    config: {
      root: new URL("./fixtures/taxonomy/", import.meta.url),
      vite: {},
    },
    injectRoute(route) {
      patterns.push(route.pattern);
    },
    updateConfig() {},
    addMiddleware() {},
  });
  assert.deepEqual(
    patterns.filter((value) => !value.startsWith("/__moo_content_integrity")),
    [],
  );
});

test("taxonomy route selection rejects unsupported fields and owners with named diagnostics", () => {
  for (const [taxonomyRoutes, diagnostic] of [
    [null, /moo\.taxonomyRoutes must be a plain object/],
    [[], /moo\.taxonomyRoutes must be a plain object/],
    [{ single: "host" }, /moo\.taxonomyRoutes\.single is unsupported/],
    [
      { archive: "theme" },
      /moo\.taxonomyRoutes\.archive must be plugin or host/,
    ],
    [{ archive: null }, /moo\.taxonomyRoutes\.archive must be plugin or host/],
  ]) {
    assert.throws(() => moo({ plugins: [], taxonomyRoutes }), diagnostic);
  }
});
