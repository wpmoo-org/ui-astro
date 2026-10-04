import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineSite } from "../config/index.js";
import { siteHref } from "../content/paths.js";
import { page } from "../plugins/page/index.js";
import { post } from "../plugins/post/index.js";
import { localePath, localizeRegistry, resolveI18n } from "../i18n/profile.js";
import {
  normalizeNotFound,
  resolveNotFoundOptions,
} from "../not-found/options.js";
import {
  notFoundRouteClaims,
  validateNotFoundRoutes,
} from "../not-found/routes.js";
import {
  prepareRegistry,
  validateBuiltPagePaths,
  validateNativePageRoutes,
  validateResolvedRoutes,
  validateExpectedPagePaths,
} from "./registry.js";

const virtualId = "virtual:wpmoo-astro/routes";
const resolvedVirtualId = "\0virtual:wpmoo-astro/routes";
const facadePath = fileURLToPath(
  new URL("../context/index.js", import.meta.url),
);
const localeVirtualId = "virtual:wpmoo-astro/i18n";
const resolvedLocaleVirtualId = "\0virtual:wpmoo-astro/i18n";
const localeFacadePath = fileURLToPath(
  new URL("../i18n/href.js", import.meta.url),
);
const integrityEntrypoint = new URL(
  "./routes/[...probe].astro",
  import.meta.url,
);
const errorVirtualId = "virtual:wpmoo-astro/not-found";
const resolvedErrorVirtualId = "\0virtual:wpmoo-astro/not-found";
const errorFacadePath = fileURLToPath(
  new URL("../not-found/index.js", import.meta.url),
);

function plainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export default function moo(input = {}) {
  if (!plainRecord(input))
    throw new TypeError("moo options must be a plain object");
  for (const key of Object.keys(input)) {
    if (
      ![
        "site",
        "plugins",
        "taxonomies",
        "taxonomyBasePath",
        "taxonomyRoutes",
        "notFound",
      ].includes(key)
    )
      throw new TypeError(`moo.${key} is unsupported`);
  }
  const site = defineSite(input.site);
  const notFound = normalizeNotFound(input.notFound);
  const plugins = input.plugins ?? [page(), post()];
  const baseRegistry = prepareRegistry(plugins, {
    taxonomies: input.taxonomies,
    taxonomyBasePath: input.taxonomyBasePath,
    taxonomyRoutes: input.taxonomyRoutes,
    lang: site.defaults.lang,
  });
  let registry = baseRegistry;
  const active = plugins.length > 0 || registry.taxonomies.length > 0;
  let context = null;
  let errorProfile = null;
  let errorClaims = [];
  let resolvedRoutes = [];
  let root = null;
  let projectionFile = null;
  let commandName;
  return {
    name: "@wpmoo/astro",
    hooks: {
      "astro:config:setup": ({
        config,
        command,
        injectRoute,
        updateConfig,
        addMiddleware,
      }) => {
        root = config.root;
        commandName = command;
        const i18n = resolveI18n(config.i18n, site);
        errorClaims = notFoundRouteClaims({ site, i18n, notFound });
        registry = localizeRegistry(baseRegistry, i18n);
        // Content sync starts a temporary Vite server during build and sync.
        // Its optimizer must not replace files used by a running dev server.
        if (
          (command === "build" || command === "sync") &&
          !config.vite.cacheDir
        ) {
          updateConfig({
            vite: {
              cacheDir: fileURLToPath(
                new URL(`node_modules/.vite/wpmoo-${command}/`, config.root),
              ),
            },
          });
        }
        for (const route of registry.routes)
          injectRoute({
            pattern: route.pattern,
            entrypoint: route.entrypoint,
            prerender: route.prerender,
          });
        for (const claim of errorClaims)
          if (claim.routeOwner === "plugin")
            injectRoute({
              pattern: claim.pattern,
              entrypoint: claim.entrypoint,
              prerender: true,
            });
        if (active) updateConfig({ prerenderConflictBehavior: "error" });
        if (active && command === "dev") {
          // Save + format-on-save may write twice inside Chokidar's 50ms
          // change throttle. Load native content after the complete save.
          if (
            config.vite.server?.watch !== null &&
            config.vite.server?.watch?.awaitWriteFinish === undefined
          ) {
            updateConfig({
              vite: {
                server: {
                  watch: {
                    awaitWriteFinish: {
                      stabilityThreshold: 100,
                      pollInterval: 20,
                    },
                  },
                },
              },
            });
          }
          addMiddleware({
            entrypoint: new URL("./middleware.js", import.meta.url),
            order: "pre",
          });
        }
        // Server query facades must pass through Vite's private virtual-module guard.
        updateConfig({
          vite: {
            ssr: { noExternal: ["@wpmoo/astro"] },
            plugins: [
              {
                name: "wpmoo-astro-context",
                resolveId(source, importer, options) {
                  if (
                    source === errorVirtualId ||
                    source === resolvedErrorVirtualId
                  ) {
                    if (
                      !options?.ssr ||
                      importer?.split("?")[0] !== errorFacadePath
                    )
                      throw new Error(
                        `${errorVirtualId} is private and server-only`,
                      );
                    return resolvedErrorVirtualId;
                  }
                  if (
                    source === localeVirtualId ||
                    source === resolvedLocaleVirtualId
                  ) {
                    if (
                      !options?.ssr ||
                      importer?.split("?")[0] !== localeFacadePath
                    )
                      throw new Error(
                        `${localeVirtualId} is private and server-only`,
                      );
                    return resolvedLocaleVirtualId;
                  }
                  if (source !== virtualId && source !== resolvedVirtualId)
                    return null;
                  if (!options?.ssr)
                    throw new Error(`${virtualId} is server-only`);
                  if (importer?.split("?")[0] !== facadePath)
                    throw new Error(
                      `${virtualId} is private to @wpmoo/astro/context`,
                    );
                  return resolvedVirtualId;
                },
                load(id, options) {
                  if (
                    [
                      resolvedErrorVirtualId,
                      resolvedLocaleVirtualId,
                      resolvedVirtualId,
                    ].includes(id) &&
                    !options?.ssr
                  )
                    throw new Error(
                      `${id.slice(1)} is private and server-only`,
                    );
                  if (id === resolvedErrorVirtualId) {
                    if (!errorProfile)
                      throw new Error(
                        `${errorVirtualId} is unavailable before Astro config resolves`,
                      );
                    return `export default ${JSON.stringify(errorProfile)};`;
                  }
                  if (id === resolvedLocaleVirtualId) {
                    if (!errorProfile)
                      throw new Error(
                        `${localeVirtualId} is unavailable before Astro config resolves`,
                      );
                    return errorProfile.i18n
                      ? 'export { getRelativeLocaleUrl } from "astro:i18n";'
                      : "export const getRelativeLocaleUrl = null;";
                  }
                  if (id !== resolvedVirtualId) return null;
                  if (!active || !context)
                    throw new Error(
                      `${virtualId} is unavailable before Astro config resolves`,
                    );
                  return `import { collections } from ${JSON.stringify(context.hostContentConfig)}; export { collections }; export default ${JSON.stringify(context.privateData)};`;
                },
              },
            ],
          },
        });
        if (active)
          injectRoute({
            pattern: "/__moo_content_integrity/[...probe]",
            entrypoint: integrityEntrypoint,
            prerender: true,
          });
      },
      "astro:routes:resolved": ({ routes }) => {
        validateNotFoundRoutes(errorClaims, routes, root);
        validateResolvedRoutes(registry, routes);
        if (active) validateNativePageRoutes(routes, integrityEntrypoint, root);
        resolvedRoutes = routes;
        if (context)
          context.privateData.resolvedRoutes = routes
            .filter((route) => route.type === "page")
            .map((route) => ({
              pattern: route.pattern,
              patternRegex: route.patternRegex.source,
              regexFlags: route.patternRegex.flags,
              type: route.type,
              entrypoint: route.entrypoint,
              origin: route.origin,
            }));
      },
      "astro:build:done": ({ pages }) => {
        if (active) validateBuiltPagePaths(pages, resolvedRoutes);
        if (projectionFile) {
          const expected = JSON.parse(readFileSync(projectionFile, "utf8"));
          validateExpectedPagePaths(
            pages,
            resolvedRoutes,
            expected,
            errorClaims.map((claim) => claim.pattern),
          );
        }
      },
      "astro:config:done": ({ config, injectTypes }) => {
        if (
          config.integrations.filter(
            (integration) => integration.name === "@wpmoo/astro",
          ).length !== 1
        ) {
          throw new TypeError("@wpmoo/astro must be registered exactly once");
        }
        if (active) {
          if (config.output !== "static")
            throw new TypeError(
              "moo requires Astro output: static for active content",
            );
          if (config.prerenderConflictBehavior !== "error") {
            throw new TypeError(
              "moo requires Astro prerenderConflictBehavior: error for active content",
            );
          }
        }
        siteHref("/", {
          base: config.base,
          trailingSlash: config.trailingSlash,
        });
        const i18n = resolveI18n(config.i18n, site);
        errorProfile = {
          site,
          base: config.base,
          trailingSlash: config.trailingSlash,
          i18n,
          notFound,
        };
        for (const locale of i18n?.locales ?? [site.defaults.lang])
          resolveNotFoundOptions(errorProfile, locale);
        injectTypes({
          filename: "not-found-context.d.ts",
          content: `declare module ${JSON.stringify(errorVirtualId)} { const profile: import("@wpmoo/astro/not-found").NotFoundInput & { site: import("@wpmoo/astro/config").SiteConfig; base: string; trailingSlash: "always" | "never" | "ignore"; i18n: import("@wpmoo/astro/context").SiteContext["i18n"]; notFound: { routeOwner: "plugin" | "host"; messages: Readonly<Record<string, Readonly<Partial<import("@wpmoo/astro/not-found").NotFoundMessages>>>> } }; export default profile; }`,
        });
        projectionFile =
          active && commandName === "build"
            ? new URL("wpmoo-published-routes.json", config.cacheDir)
            : null;
        const files = [
          "content.config.ts",
          "content.config.mts",
          "content.config.js",
          "content.config.mjs",
        ]
          .map((name) => new URL(name, config.srcDir))
          .filter((url) => existsSync(fileURLToPath(url)));
        if (active && files.length !== 1) {
          throw new TypeError(
            `moo requires exactly one host content.config file in ${fileURLToPath(config.srcDir)}`,
          );
        }
        if (active)
          injectTypes({
            filename: "route-context.d.ts",
            content: `
declare module ${JSON.stringify(localeVirtualId)} {
  export const getRelativeLocaleUrl: typeof import("astro:i18n").getRelativeLocaleUrl;
}
declare module ${JSON.stringify(virtualId)} {
  interface RouteSource {
    readonly collection: string;
    readonly kind: "markdown" | "json" | "json-directory";
    readonly base?: string;
    readonly file?: string;
    readonly formats: readonly ("md" | "mdx")[];
  }
  const context: import("@wpmoo/astro/context").SiteContext & {
    readonly root: string;
    readonly sources: readonly RouteSource[];
    readonly singlePrefixes: Readonly<Record<string, string>>;
    readonly navigation: readonly { readonly label: string; readonly path: string; readonly match: "exact" | "prefix" }[];
    readonly projectionFile: string | null;
    readonly errorPatterns: readonly string[];
    readonly archivePaths: readonly { readonly id: string; readonly locale: string; readonly path: string; readonly pattern: string }[];
    readonly singleRoutes: readonly { readonly type: string; readonly locale: string; readonly pattern: string; readonly allowNativeHost: boolean }[];
    readonly resolvedRoutes: readonly { readonly pattern: string; readonly patternRegex: string; readonly regexFlags: string; readonly type: "page"; readonly entrypoint: string; readonly origin: string }[];
    readonly taxonomyGroups: readonly { readonly pattern: string; readonly root: boolean; readonly taxonomies: readonly string[]; readonly routeOwner: "plugin" | "host"; readonly locale?: string }[];
  };
  export const collections: Record<string, ReturnType<typeof import("astro:content").defineCollection>>;
  export default context;
}
`,
          });
        context = {
          hostContentConfig: files.length ? fileURLToPath(files[0]) : null,
          privateData: {
            root: config.root.href,
            projectionFile: projectionFile?.href ?? null,
            errorPatterns: errorClaims.map((claim) => claim.pattern),
            archivePaths: registry.routeClaims
              .filter((claim) => !claim.pattern.includes("["))
              .map((claim) => ({
                id: `${claim.owner}/archive`,
                locale: claim.locale ?? site.defaults.lang,
                path: claim.pattern,
                pattern: claim.pattern,
              })),
            resolvedRoutes: [],
            singleRoutes: plugins.flatMap((plugin) =>
              plugin.contentTypes.flatMap((type) =>
                (i18n?.locales ?? [site.defaults.lang]).map((locale) => {
                  const prefix =
                    plugin.locales?.[locale]?.basePath ?? plugin.basePath;
                  const route = plugin.routes.find(
                    (route) => route.id === type.singleRoute,
                  );
                  const pattern = localePath(
                    `${prefix === "/" ? "" : prefix}${route.pattern}`,
                    locale,
                    i18n,
                  );
                  return {
                    type: type.id,
                    locale,
                    pattern,
                    allowNativeHost:
                      route.owner === "host" &&
                      !registry.taxonomyGroups.some(
                        (group) => group.root && group.pattern === pattern,
                      ),
                  };
                }),
              ),
            ),
            i18n,
            singlePrefixes: Object.fromEntries(
              plugins.flatMap((plugin) =>
                plugin.contentTypes.map((type) => {
                  const pattern = plugin.routes.find(
                    (route) => route.id === type.singleRoute,
                  ).pattern;
                  const prefix = pattern.slice(0, -"/[...slug]".length);
                  return [
                    type.id,
                    `${plugin.basePath === "/" ? "" : plugin.basePath}${prefix}`,
                  ];
                }),
              ),
            ),
            navigation: plugins.flatMap((plugin) => plugin.navigation),
            taxonomies: registry.taxonomies.map(
              ({ source, ...metadata }) => metadata,
            ),
            taxonomyBasePath: registry.taxonomyBasePath,
            taxonomyGroups: registry.taxonomyGroups,
            sources: [
              ...registry.contentTypes.map((type) => ({
                collection: type.collection,
                kind: type.source.kind,
                ...(type.source.kind === "json"
                  ? { file: type.source.file }
                  : {
                      base:
                        type.source.base ??
                        new URL(`content/${type.collection}/`, config.srcDir)
                          .href,
                    }),
                formats: type.source.formats ?? [],
              })),
              ...registry.taxonomies.map((taxonomy) => ({
                collection: taxonomy.id,
                kind: taxonomy.sourceKind,
                formats: [],
                ...(taxonomy.sourceKind === "json"
                  ? { file: taxonomy.source }
                  : { base: taxonomy.source }),
              })),
            ],
            site,
            base: config.base,
            trailingSlash: config.trailingSlash,
            plugins: plugins.map((plugin) => ({
              id: plugin.id,
              label: plugin.label,
              basePath: plugin.basePath,
              ...(plugin.locales ? { locales: plugin.locales } : {}),
              contentTypes: plugin.contentTypes.map((type) => ({
                id: type.id,
                collection: type.collection,
                sourceKind: type.source.kind,
                formats: type.source.formats ?? [],
                singleRoute: type.singleRoute,
                taxonomies: type.taxonomies,
              })),
            })),
          },
        };
      },
    },
  };
}
