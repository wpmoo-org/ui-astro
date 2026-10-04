import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRegistry,
  validateResolvedRoutes,
  validateExpectedPagePaths,
} from "../packages/astro/src/integration/registry.js";
import { definePlugin } from "../packages/astro/src/plugins/index.js";
import { page } from "../packages/astro/src/plugins/page/index.js";
import { post } from "../packages/astro/src/plugins/post/index.js";
import moo from "../packages/astro/src/integration/index.js";
import { defineTaxonomy } from "../packages/astro/src/taxonomies/index.js";

test("omitted plugin selection registers Page and Post, while an explicit list replaces it", () => {
  for (const [input, expected] of [
    [undefined, ["/[...slug]", "/posts", "/posts/[...slug]", "/404"]],
    [{ plugins: [page()] }, ["/[...slug]", "/404"]],
    [{ plugins: [] }, ["/404"]],
  ]) {
    const routes = [];
    moo(input).hooks["astro:config:setup"]({
      command: "dev",
      config: {
        root: new URL("../apps/consumer/", import.meta.url),
        vite: {},
      },
      injectRoute(value) {
        routes.push(value.pattern);
      },
      updateConfig() {},
      addMiddleware() {},
    });
    assert.deepEqual(
      routes.filter(
        (pattern) => !pattern.startsWith("/__moo_content_integrity"),
      ),
      expected,
    );
  }
});

function localizedSetup(plugins, taxonomy) {
  const routes = [];
  moo({
    site: { defaults: { lang: "de" } },
    plugins,
    taxonomies: [taxonomy],
  }).hooks["astro:config:setup"]({
    command: "build",
    config: {
      root: new URL("../apps/consumer/", import.meta.url),
      vite: {},
      i18n: {
        locales: ["en", "de"],
        defaultLocale: "de",
        routing: { prefixDefaultLocale: false },
      },
    },
    injectRoute(value) {
      routes.push(value.pattern);
    },
    updateConfig() {},
    addMiddleware() {},
  });
  return routes.filter(
    (pattern) => !pattern.startsWith("/__moo_content_integrity"),
  );
}

test("moo checks plugin and taxonomy namespaces in the same active locale", () => {
  const taxonomy = defineTaxonomy({
    id: "category",
    label: "Categories",
    source: new URL(
      "./fixtures/taxonomy/src/data/category.json",
      import.meta.url,
    ),
    archive: { basePath: "/c" },
    locales: { de: { basePath: "/posts" } },
  });
  const plugins = [post({ locales: { de: { basePath: "/beitraege" } } })];
  assert.deepEqual(localizedSetup(plugins, taxonomy), [
    "/en/posts",
    "/en/posts/[...slug]",
    "/en/c/[slug]",
    "/beitraege",
    "/beitraege/[...slug]",
    "/posts/[slug]",
    "/404",
    "/en/404",
  ]);
  assert.equal(plugins[0].basePath, "/posts");
  assert.equal(taxonomy.archive.basePath, "/c");
});

test("moo ignores authored namespaces overridden in every active locale", () => {
  const taxonomy = defineTaxonomy({
    id: "category",
    label: "Categories",
    source: new URL(
      "./fixtures/taxonomy/src/data/category.json",
      import.meta.url,
    ),
    archive: { basePath: "/posts" },
  });
  assert.deepEqual(
    localizedSetup(
      [
        post({
          locales: {
            en: { basePath: "/articles" },
            de: { basePath: "/beitraege" },
          },
        }),
      ],
      taxonomy,
    ),
    [
      "/en/articles",
      "/en/articles/[...slug]",
      "/en/posts/[slug]",
      "/beitraege",
      "/beitraege/[...slug]",
      "/posts/[slug]",
      "/404",
      "/en/404",
    ],
  );
  assert.throws(
    () =>
      localizedSetup(
        [post({ locales: { en: { basePath: "/articles" } } })],
        taxonomy,
      ),
    /namespace \/posts.*taxonomy category.*post/,
  );
});

function external(id, basePath, { collection = id, type = id } = {}) {
  return definePlugin({
    apiVersion: 1,
    id,
    label: id,
    basePath,
    contentTypes: [
      {
        id: type,
        collection,
        singleRoute: "single",
        source: {
          kind: "json-directory",
          base: new URL("../apps/consumer/src/content/page/", import.meta.url),
        },
      },
    ],
    routes: [
      {
        id: "single",
        pattern: "/[...slug]",
        prerender: true,
        entrypoint: new URL(
          "../apps/consumer/src/pages/index.astro",
          import.meta.url,
        ),
      },
    ],
  });
}

test("registry records one owner for each active type, collection, and final route", () => {
  const registry = buildRegistry([page(), external("sample", "/sample")]);
  assert.deepEqual(
    registry.routes.map(({ owner, pattern }) => ({ owner, pattern })),
    [
      { owner: "page", pattern: "/[...slug]" },
      { owner: "sample", pattern: "/sample/[...slug]" },
    ],
  );
  assert.deepEqual(
    registry.contentTypes.map(({ owner, id, collection }) => ({
      owner,
      id,
      collection,
    })),
    [
      { owner: "page", id: "page", collection: "page" },
      { owner: "sample", id: "sample", collection: "sample" },
    ],
  );
});

test("registry rejects cross-plugin collection, type, and namespace conflicts", () => {
  assert.throws(
    () =>
      buildRegistry([
        page(),
        external("sample", "/sample", { collection: "page" }),
      ]),
    /collection page.*page.*sample/i,
  );
  assert.throws(
    () =>
      buildRegistry([
        external("sample", "/sample", { type: "shared" }),
        external("other", "/other", { type: "shared" }),
      ]),
    /type shared.*sample.*other/i,
  );
  assert.throws(
    () =>
      buildRegistry([
        page(),
        external("sample", "/sample"),
        external("nested", "/sample/nested"),
      ]),
    /namespace.*sample.*nested/i,
  );
});

test("resolved routes require their one declared project or integration owner", () => {
  const injected = buildRegistry([page()]);
  const externalRoute = {
    pattern: "/[...slug]",
    origin: "external",
    isPrerendered: true,
  };
  assert.doesNotThrow(() => validateResolvedRoutes(injected, [externalRoute]));
  assert.throws(
    () =>
      validateResolvedRoutes(injected, [
        externalRoute,
        { ...externalRoute, origin: "project" },
      ]),
    /page.*\/\[\.\.\.slug\].*multiple/i,
  );
  assert.throws(
    () =>
      validateResolvedRoutes(injected, [
        { ...externalRoute, isPrerendered: false },
      ]),
    /page.*prerender/i,
  );

  const host = buildRegistry([page({ routes: { single: "host" } })]);
  assert.deepEqual(host.routes, []);
  assert.doesNotThrow(() =>
    validateResolvedRoutes(host, [{ ...externalRoute, origin: "project" }]),
  );
  assert.throws(
    () => validateResolvedRoutes(host, [externalRoute]),
    /page.*project.*\/\[\.\.\.slug\]/i,
  );
  assert.throws(
    () => validateResolvedRoutes(host, []),
    /page.*project.*\/\[\.\.\.slug\]/i,
  );
});

test("the Page integration registers a private pre-middleware only for development", () => {
  for (const command of ["dev", "build"]) {
    const middleware = [];
    moo().hooks["astro:config:setup"]({
      command,
      config: {
        root: new URL("../apps/consumer/", import.meta.url),
        vite: {},
      },
      injectRoute() {},
      updateConfig() {},
      addMiddleware(value) {
        middleware.push(value);
      },
    });
    assert.equal(middleware.length, command === "dev" ? 1 : 0);
    if (command === "dev") {
      assert.equal(middleware[0].order, "pre");
      assert.match(
        middleware[0].entrypoint.href,
        /\/src\/integration\/middleware\.js$/,
      );
    }
  }
});

test("build and sync use a separate cache from the running development server", () => {
  const root = new URL("../apps/consumer/", import.meta.url);
  const devCache = new URL("node_modules/.vite/", root).pathname;
  for (const command of ["dev", "build", "sync", "preview"]) {
    const updates = [];
    moo({ plugins: [] }).hooks["astro:config:setup"]({
      command,
      config: { root, vite: {} },
      injectRoute() {},
      addMiddleware() {},
      updateConfig(value) {
        updates.push(value);
      },
    });
    const cache =
      updates.find((value) => value.vite?.cacheDir)?.vite.cacheDir ?? devCache;
    if (command === "dev" || command === "preview")
      assert.equal(cache, devCache);
    else {
      assert.notEqual(
        cache,
        devCache,
        `${command} must preserve dev optimizer files`,
      );
      assert.ok(cache.startsWith(new URL("node_modules/", root).pathname));
    }
  }
});

test("an explicit host Vite cache directory remains host-owned", () => {
  const updates = [];
  moo({ plugins: [] }).hooks["astro:config:setup"]({
    command: "build",
    config: {
      root: new URL("../apps/consumer/", import.meta.url),
      vite: { cacheDir: "/tmp/site-vite-cache" },
    },
    injectRoute() {},
    addMiddleware() {},
    updateConfig(value) {
      updates.push(value);
    },
  });
  assert.ok(updates.every((value) => value.vite?.cacheDir === undefined));
});

test("explicit host save-stability and disabled watcher settings remain host-owned", () => {
  for (const watch of [
    null,
    { awaitWriteFinish: false },
    { awaitWriteFinish: true },
    {
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
      usePolling: true,
    },
  ]) {
    const updates = [];
    moo().hooks["astro:config:setup"]({
      command: "dev",
      config: {
        root: new URL("../apps/consumer/", import.meta.url),
        vite: { server: { watch } },
      },
      injectRoute() {},
      addMiddleware() {},
      updateConfig(value) {
        updates.push(value);
      },
    });
    assert.ok(
      updates.every((value) => value.vite?.server?.watch === undefined),
    );
  }
});

function finalConfig(integration, overrides = {}) {
  const root = new URL("./fixtures/page-base/", import.meta.url);
  const config = {
    root,
    srcDir: new URL("src/", root),
    vite: {},
    base: "/docs",
    trailingSlash: "ignore",
    output: "static",
    prerenderConflictBehavior: "error",
    integrations: [integration],
    ...overrides,
  };
  integration.hooks["astro:config:setup"]({
    command: "sync",
    config,
    injectRoute() {},
    updateConfig() {},
    addMiddleware() {},
  });
  return config;
}

test("active content makes concrete prerender conflicts fatal", () => {
  const updates = [];
  moo().hooks["astro:config:setup"]({
    command: "build",
    config: {
      root: new URL("./fixtures/page-base/", import.meta.url),
      vite: {},
    },
    injectRoute() {},
    addMiddleware() {},
    updateConfig(value) {
      updates.push(value);
    },
  });
  assert.ok(
    updates.some((value) => value.prerenderConflictBehavior === "error"),
  );
});

test("the final content profile rejects weakened conflicts, server output, and a noncanonical base", () => {
  for (const [overrides, diagnostic] of [
    [{ prerenderConflictBehavior: "warn" }, /prerenderConflictBehavior.*error/],
    [
      { prerenderConflictBehavior: "ignore" },
      /prerenderConflictBehavior.*error/,
    ],
    [{ output: "server" }, /output.*static/],
    [{ base: "/Docs" }, /base.*canonical.*Docs/],
  ]) {
    const integration = moo();
    assert.throws(
      () =>
        integration.hooks["astro:config:done"]({
          config: finalConfig(integration, overrides),
        }),
      diagnostic,
    );
  }
  const integration = moo();
  assert.doesNotThrow(() =>
    integration.hooks["astro:config:done"]({
      config: finalConfig(integration),
      injectTypes() {},
    }),
  );
});

test("one host cannot register the Moo integration twice", () => {
  const integration = moo();
  assert.throws(
    () =>
      integration.hooks["astro:config:done"]({
        config: finalConfig(integration, {
          integrations: [integration, moo()],
        }),
      }),
    /@wpmoo\/astro.*once|duplicate.*@wpmoo\/astro/,
  );
});

test("UI-only composition keeps its output policy and uses a canonical recovery base", () => {
  const integration = moo({ plugins: [] });
  assert.doesNotThrow(() =>
    integration.hooks["astro:config:done"]({
      config: finalConfig(integration, {
        output: "server",
        base: "/docs",
        prerenderConflictBehavior: "warn",
      }),
      injectTypes() {},
    }),
  );
  assert.throws(
    () =>
      integration.hooks["astro:config:done"]({
        config: finalConfig(integration, { base: "/Docs" }),
        injectTypes() {},
      }),
    /base.*canonical/,
  );
});

test("root archive ownership rejects an undeclared dynamic companion but permits unclaimed native pages", () => {
  const taxonomy = defineTaxonomy({
    id: "tag",
    label: "Tags",
    source: new URL("./fixtures/tag.json", import.meta.url),
    archive: { basePath: "/" },
  });
  const registry = buildRegistry([page()], { taxonomies: [taxonomy] });
  const root = {
    pattern: "/[...slug]",
    origin: "external",
    isPrerendered: true,
    type: "page",
  };
  assert.doesNotThrow(() =>
    validateResolvedRoutes(registry, [
      root,
      { ...root, pattern: "/native", origin: "project" },
    ]),
  );
  assert.throws(
    () =>
      validateResolvedRoutes(registry, [
        root,
        {
          ...root,
          pattern: "/[slug]",
          origin: "project",
          entrypoint: "src/pages/[slug].astro",
        },
      ]),
    /root.*conflict.*\[slug\]|\[slug\].*conflict.*root/,
  );
});

test("emitted canonical inventory requires its declared owner and all outputs", () => {
  const expected = [
    {
      id: "category/layouts",
      locale: "en",
      path: "/layouts",
      pattern: "/[...slug]",
    },
  ];
  const root = {
    pattern: "/[...slug]",
    type: "page",
    origin: "external",
    patternRegex: /^\/(.*?)\/?$/,
    entrypoint: "root.astro",
  };
  assert.doesNotThrow(() =>
    validateExpectedPagePaths([{ pathname: "layouts/" }], [root], expected),
  );
  assert.throws(
    () => validateExpectedPagePaths([], [root], expected),
    /category\/layouts.*no emitted route.*\/layouts/,
  );
  assert.throws(
    () =>
      validateExpectedPagePaths(
        [{ pathname: "layouts/" }],
        [
          {
            ...root,
            pattern: "/layouts",
            patternRegex: /^\/layouts\/?$/,
            origin: "project",
            entrypoint: "src/pages/layouts.astro",
          },
          root,
        ],
        expected,
      ),
    /category\/layouts.*en.*conflict.*layouts\.astro/,
  );
  assert.throws(
    () =>
      validateExpectedPagePaths(
        [{ pathname: "layouts/" }, { pathname: "layouts" }],
        [root],
        expected,
      ),
    /multiple.*\/layouts/,
  );
});
