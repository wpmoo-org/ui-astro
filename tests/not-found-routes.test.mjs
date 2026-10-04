import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";
import moo from "../packages/astro/src/integration/index.js";
import { defineSite } from "../packages/astro/src/config/index.js";
import { resolveI18n } from "../packages/astro/src/i18n/profile.js";
import { normalizeNotFound } from "../packages/astro/src/not-found/options.js";
import {
  notFoundRouteClaims,
  validateNotFoundRoutes,
} from "../packages/astro/src/not-found/routes.js";
import {
  validateExpectedRouteOwners,
  validateExpectedPagePaths,
} from "../packages/astro/src/integration/registry.js";

function profile(main = "en", prefix = false, owner = "plugin") {
  const site = defineSite({ defaults: { lang: main } });
  return {
    site,
    base: "/",
    trailingSlash: "ignore",
    i18n: resolveI18n(
      {
        locales: ["en", "de"],
        defaultLocale: main,
        routing: { prefixDefaultLocale: prefix },
      },
      site,
    ),
    notFound: normalizeNotFound({ routeOwner: owner }),
  };
}
function routes(claims) {
  return claims.map((claim) => ({
    pattern: claim.pattern,
    origin: claim.routeOwner === "host" ? "project" : "external",
    entrypoint:
      claim.routeOwner === "host"
        ? `src/pages${claim.pattern}.astro`
        : claim.entrypoint,
    isPrerendered: true,
    type: "page",
    patternRegex: new RegExp(`^${claim.pattern}/?$`),
  }));
}
function configured(input = { plugins: [] }, overrides = {}) {
  const integration = moo(input);
  const root = new URL("./fixtures/ui-only/", import.meta.url);
  const config = {
    root,
    srcDir: new URL("src/", root),
    cacheDir: new URL(".astro/", root),
    vite: {},
    base: "/",
    trailingSlash: "ignore",
    output: "static",
    prerenderConflictBehavior: "error",
    integrations: [integration],
    ...overrides,
  };
  const injected = [],
    updates = [],
    middleware = [],
    declarations = [];
  integration.hooks["astro:config:setup"]({
    config,
    command: "build",
    injectRoute: (value) => injected.push(value),
    updateConfig: (value) => updates.push(value),
    addMiddleware: (value) => middleware.push(value),
  });
  integration.hooks["astro:config:done"]({
    config,
    injectTypes: (value) => declarations.push(value),
  });
  return {
    integration,
    config,
    injected,
    updates,
    middleware,
    declarations,
    guard: updates
      .flatMap((value) => value.vite?.plugins ?? [])
      .find((plugin) => plugin.name === "wpmoo-astro-context"),
  };
}

test("default_and_host_error_claims", () => {
  for (const [main, expected] of [
    ["en", ["/404", "/de/404"]],
    ["de", ["/404", "/en/404"]],
  ]) {
    for (const owner of ["plugin", "host"]) {
      const claims = notFoundRouteClaims(profile(main, false, owner));
      assert.deepEqual(
        claims.map((claim) => claim.pattern),
        expected,
      );
      assert.ok(Object.isFrozen(claims) && claims.every(Object.isFrozen));
      assert.ok(
        claims.every(
          (claim) => claim.owner === "not-found" && claim.routeOwner === owner,
        ),
      );
      assert.doesNotThrow(() => validateNotFoundRoutes(claims, routes(claims)));
    }
  }
  assert.deepEqual(
    configured({ plugins: [], notFound: { routeOwner: "host" } }).injected,
    [],
  );
  assert.deepEqual(
    configured().injected.map((route) => route.pattern),
    ["/404"],
  );
});
test("root_fallback_survives_prefixed_default", () => {
  for (const main of ["en", "de"]) {
    const claims = notFoundRouteClaims(profile(main, true));
    assert.deepEqual(
      claims.map((claim) => claim.pattern),
      ["/404", "/en/404", "/de/404"],
    );
    assert.equal(new Set(claims.map((claim) => claim.pattern)).size, 3);
  }
});
test("duplicate_owner_suggests_host_choice", () => {
  const claims = notFoundRouteClaims(profile());
  const resolved = routes(claims);
  assert.throws(
    () =>
      validateNotFoundRoutes(claims, [
        ...resolved,
        {
          ...resolved[0],
          origin: "project",
          entrypoint: "src/pages/404.astro",
        },
      ]),
    /\/404.*multiple.*moo\.notFound\.routeOwner.*host/,
  );
  assert.throws(
    () =>
      validateNotFoundRoutes(claims, [
        { ...resolved[0], entrypoint: "imposter.astro" },
        resolved[1],
      ]),
    /\/404.*entrypoint/,
  );
});
test("host_requires_every_literal_error_file", () => {
  const claims = notFoundRouteClaims(profile("en", false, "host"));
  const resolved = routes(claims);
  assert.throws(
    () => validateNotFoundRoutes(claims, resolved.slice(0, 1)),
    /not-found.*project.*\/de\/404/,
  );
  assert.throws(
    () =>
      validateNotFoundRoutes(claims, [
        { ...resolved[0], isPrerendered: false },
        resolved[1],
      ]),
    /\/404.*prerender/,
  );
  assert.throws(
    () =>
      validateNotFoundRoutes(claims, [
        { ...resolved[0], type: "endpoint" },
        resolved[1],
      ]),
    /\/404.*page/,
  );
  assert.throws(
    () =>
      validateNotFoundRoutes(claims, [
        { ...resolved[0], origin: "external" },
        resolved[1],
      ]),
    /project.*\/404/,
  );
});
test("injected_entrypoints_use_the_Astro_host_root", () => {
  const claims = notFoundRouteClaims(profile());
  const root = new URL("./fixtures/ui-only/", import.meta.url);
  const resolved = routes(claims).map((route) => ({
    ...route,
    entrypoint: relative(fileURLToPath(root), route.entrypoint),
  }));
  assert.doesNotThrow(() => validateNotFoundRoutes(claims, resolved, root));
});
test("error_context_has_no_content_import", () => {
  const state = configured(
    { plugins: [], site: { defaults: { lang: "de" } } },
    {
      i18n: {
        locales: ["en", "de"],
        defaultLocale: "de",
        routing: { prefixDefaultLocale: true },
      },
      base: "/site",
    },
  );
  assert.equal(state.middleware.length, 0);
  assert.ok(
    state.updates.some((value) =>
      value.vite?.ssr?.noExternal.includes("@wpmoo/astro"),
    ),
  );
  assert.ok(
    state.declarations.some((value) =>
      value.content.includes("virtual:wpmoo-astro/not-found"),
    ),
  );
  const id = state.guard.resolveId(
    "virtual:wpmoo-astro/not-found",
    fileURLToPath(
      new URL("../packages/astro/src/not-found/index.js", import.meta.url),
    ),
    { ssr: true },
  );
  const source = state.guard.load(id, { ssr: true });
  assert.doesNotMatch(
    source,
    /content\.config|astro:content|import |collections/,
  );
  const data = JSON.parse(
    source.replace(/^export default /, "").replace(/;$/, ""),
  );
  assert.equal(data.site.defaults.lang, "de");
  assert.equal(data.base, "/site");
  assert.deepEqual(data.i18n.locales, ["en", "de"]);
  assert.throws(
    () => state.guard.load("\0virtual:wpmoo-astro/routes", { ssr: true }),
    /inactive|unavailable/,
  );
});
test("private_error_context_requires_exact_ssr_facade", () => {
  const state = configured();
  const facade = fileURLToPath(
    new URL("../packages/astro/src/not-found/index.js", import.meta.url),
  );
  for (const [importer, ssr] of [
    [facade, false],
    ["/tmp/index.js", true],
    [`${facade}.spoof`, true],
    [undefined, true],
  ]) {
    assert.throws(
      () =>
        state.guard.resolveId("virtual:wpmoo-astro/not-found", importer, {
          ssr,
        }),
      /private.*server-only/,
    );
  }
  assert.equal(
    state.guard.resolveId("virtual:wpmoo-astro/not-found", `${facade}?v=1`, {
      ssr: true,
    }),
    "\0virtual:wpmoo-astro/not-found",
  );
  const integration = moo({ plugins: [] }),
    updates = [];
  integration.hooks["astro:config:setup"]({
    config: state.config,
    command: "dev",
    injectRoute() {},
    addMiddleware() {},
    updateConfig: (value) => updates.push(value),
  });
  const guard = updates
    .flatMap((value) => value.vite?.plugins ?? [])
    .find((plugin) => plugin.name === "wpmoo-astro-context");
  assert.throws(
    () => guard.load("\0virtual:wpmoo-astro/not-found", { ssr: true }),
    /before Astro config resolves/,
  );
});
test("resolved_private_profiles_reject_client_loading", () => {
  const state = configured();
  for (const name of ["not-found", "i18n", "routes"]) {
    const source = `virtual:wpmoo-astro/${name}`;
    const resolved = `\0${source}`;
    for (const options of [{ ssr: false }, undefined]) {
      assert.throws(() => state.guard.load(resolved, options), /server-only/);
    }
    assert.throws(
      () => state.guard.resolveId(resolved, "/tmp/client.js", { ssr: false }),
      /server-only/,
    );
    assert.throws(
      () => state.guard.resolveId(resolved, "/tmp/spoof.js", { ssr: true }),
      /private/,
    );
  }
  assert.equal(state.guard.load("unrelated-module", { ssr: false }), null);
  assert.match(
    state.guard.load("\0virtual:wpmoo-astro/not-found", { ssr: true }),
    /^export default /,
  );
});
test("error_owners_cannot_be_borrowed_by_published_content", () => {
  const resolved = routes(notFoundRouteClaims(profile("en", false, "host")));
  for (const path of ["/404", "/de/404"]) {
    const expected = [
      {
        id: "page/error",
        locale: "en",
        path,
        pattern: "/[...slug]",
        allowNativeHost: true,
      },
    ];
    assert.throws(
      () =>
        validateExpectedRouteOwners(expected, resolved, ["/404", "/de/404"]),
      /published content.*reserved.*error/,
    );
    assert.throws(
      () =>
        validateExpectedPagePaths(
          [{ pathname: path.slice(1) }],
          resolved,
          expected,
          ["/404", "/de/404"],
        ),
      /published content.*reserved.*error/,
    );
  }
  for (const path of ["/404-guide", "/404/child"]) {
    assert.doesNotThrow(() =>
      validateExpectedRouteOwners(
        [{ id: "page/neighbor", locale: "en", path, pattern: "/[...slug]" }],
        [
          {
            type: "page",
            pattern: "/[...slug]",
            patternRegex: /^\/(.*?)\/?$/,
            origin: "external",
          },
        ],
        ["/404", "/de/404"],
      ),
    );
  }
});
test("inactive_content_still_validates_the_shared_error_locale_profile", () => {
  for (const i18n of [
    { locales: ["en", "de"], defaultLocale: "de" },
    { locales: ["en", "de"], defaultLocale: "en", routing: "manual" },
  ]) {
    assert.throws(
      () => configured({ plugins: [] }, { i18n }),
      /lang.*defaultLocale|manual/,
    );
  }
  assert.throws(
    () => moo({ plugins: [], notFound: { unknown: true } }),
    /moo\.notFound\.unknown/,
  );
  assert.throws(
    () =>
      configured({
        plugins: [],
        notFound: { messages: { de: { title: "Fehler" } } },
      }),
    /messages\.de.*active/,
  );
  const state = configured();
  assert.throws(
    () =>
      state.integration.hooks["astro:config:done"]({
        config: {
          ...state.config,
          integrations: [state.integration, moo({ plugins: [] })],
        },
        injectTypes() {},
      }),
    /registered exactly once/,
  );
});
