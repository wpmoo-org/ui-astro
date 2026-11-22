import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizePlacements } from "../placements/options.js";
import { addTermLinks, normalizeTermLinks } from "../markdown/term-links.js";
import {
  placementVitePlugin,
  validatePlacementRegistry,
} from "../placements/vite.js";

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
import {
  collisionMessage,
  competingIntegrations,
  leftOutReport,
  missingSiteMessage,
  reservedOutput,
  resolveSeoOutputs,
  writeSeoOutputs,
} from "./sitemap.js";
import { isErrorPagePath } from "../seo/error-page.js";
import {
  normalizeSitemap,
  resolveSitemapOptions,
  sitemapPagePath,
} from "../sitemap/options.js";

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
const sitemapVirtualId = "virtual:wpmoo-astro/sitemap";
const resolvedSitemapVirtualId = "\0virtual:wpmoo-astro/sitemap";
const sitemapFacadePath = fileURLToPath(
  new URL("../sitemap/index.js", import.meta.url),
);
const sitemapEntrypoint = fileURLToPath(
  new URL("./routes/sitemap.astro", import.meta.url),
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
        "sitemap",
        "blocks",
        "placements",
        "termLinks",
      ].includes(key)
    )
      throw new TypeError(`moo.${key} is unsupported`);
  }
  const site = defineSite(input.site);
  // sitemap.xml and robots.txt, on unless site.seo turns them off.
  const seoOutputs = resolveSeoOutputs(site.seo);
  let seoBuild = null;
  const placementOptions = normalizePlacements({
    blocks: input.blocks,
    placements: input.placements,
  });
  let placementProfile = null;
  const notFound = normalizeNotFound(input.notFound);
  const sitemapCopy = normalizeSitemap(input.sitemap);
  // The HTML sitemap page, one per locale, filled at build:done.
  let sitemapPatterns = [];
  let sitemapProfile = null;
  // Random per build: the page's template tokens never match host content.
  let sitemapNonce = "";
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
        seoBuild =
          command === "build" && (seoOutputs.sitemap || seoOutputs.robots)
            ? { base: config.base }
            : null;
        // Named things in Markdown content link to their pages (first mention).
        const termLinks = normalizeTermLinks(input.termLinks, config.root);
        if (termLinks.length)
          addTermLinks(config.markdown?.processor, termLinks, { site: config.site });
        const i18n = resolveI18n(config.i18n, site);
        errorClaims = notFoundRouteClaims({ site, i18n, notFound });
        sitemapNonce = randomBytes(12).toString("hex");
        sitemapPatterns = seoOutputs.htmlSitemap
          ? (i18n?.locales ?? [site.defaults.lang]).map((locale) => ({
              locale,
              pattern: sitemapPagePath(locale, i18n),
            }))
          : [];
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
        for (const { pattern } of sitemapPatterns)
          injectRoute({ pattern, entrypoint: sitemapEntrypoint, prerender: true });
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
              placementVitePlugin(() => placementProfile),
              {
                name: "wpmoo-astro-context",
                resolveId(source, importer, options) {
                  if (
                    source === sitemapVirtualId ||
                    source === resolvedSitemapVirtualId
                  ) {
                    if (
                      !options?.ssr ||
                      importer?.split("?")[0] !== sitemapFacadePath
                    )
                      throw new Error(
                        `${sitemapVirtualId} is private and server-only`,
                      );
                    return resolvedSitemapVirtualId;
                  }
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
                      resolvedSitemapVirtualId,
                      resolvedErrorVirtualId,
                      resolvedLocaleVirtualId,
                      resolvedVirtualId,
                    ].includes(id) &&
                    !options?.ssr
                  )
                    throw new Error(
                      `${id.slice(1)} is private and server-only`,
                    );
                  if (id === resolvedSitemapVirtualId) {
                    if (!sitemapProfile)
                      throw new Error(
                        `${sitemapVirtualId} is unavailable before Astro config resolves`,
                      );
                    // Literal page routes for the development list, without
                    // error pages (the shared rule; patterns are base-relative).
                    const locales = sitemapProfile.i18n?.locales ?? [];
                    const staticPaths = resolvedRoutes
                      .filter(
                        (route) =>
                          route.type === "page" &&
                          route.origin !== "internal" &&
                          !route.pattern.includes("[") &&
                          !isErrorPagePath(route.pattern, { locales }),
                      )
                      .map((route) => route.pattern);
                    // Only the dev list reads content; a build never loads
                    // the content context, which an inactive site lacks.
                    const loader =
                      active && sitemapProfile.development
                        ? `() => Promise.all([import("astro:content"), import(${JSON.stringify(facadePath)})])`
                        : "null";
                    return `export default ${JSON.stringify({ ...sitemapProfile, staticPaths })}; export const loadContent = ${loader};`;
                  }
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
        // A host route that emits an SDK output collides with it.
        if (seoBuild)
          for (const route of routes) {
            const file =
              reservedOutput(route.pattern, seoOutputs, seoBuild.base) ??
              reservedOutput(route.pathname, seoOutputs, seoBuild.base);
            if (file)
              throw new Error(
                collisionMessage(
                  file,
                  `the route ${route.pattern} (${route.entrypoint})`,
                ),
              );
          }
        // The SDK owns each locale's sitemap page; a host page there collides.
        for (const { pattern } of sitemapPatterns) {
          const matches = routes.filter((route) => route.pattern === pattern);
          const host = matches.find((route) => route.origin !== "external");
          if (host)
            throw new Error(
              collisionMessage(
                `${pattern}/`.replace(/^\/\//u, "/"),
                `the route ${host.pattern} (${host.entrypoint})`,
              ),
            );
          const owned = matches.filter(
            (route) =>
              route.origin === "external" &&
              (root
                ? fileURLToPath(new URL(route.entrypoint, root))
                : route.entrypoint) === sitemapEntrypoint,
          );
          if (matches.length !== 1 || owned.length !== 1)
            throw new Error(
              collisionMessage(
                `${pattern}/`,
                `another route at ${pattern} (${matches.map((route) => route.entrypoint).join(", ")})`,
              ),
            );
        }
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
      "astro:build:done": ({ pages, dir, logger }) => {
        if (active) validateBuiltPagePaths(pages, resolvedRoutes);
        if (projectionFile) {
          const expected = JSON.parse(readFileSync(projectionFile, "utf8"));
          validateExpectedPagePaths(
            pages,
            resolvedRoutes,
            expected,
            errorClaims.map((claim) => claim.pattern),
            sitemapPatterns.map((claim) => claim.pattern),
          );
        }
        if (seoBuild?.config) {
          const result = writeSeoOutputs({
            dir,
            pages,
            ...seoBuild.config,
            outputs: seoOutputs,
            warn: (message) => logger.warn(message),
            i18n: sitemapProfile.i18n,
            lang: sitemapProfile.site.defaults.lang,
            xslCopy: resolveSitemapOptions(
              sitemapProfile,
              sitemapProfile.i18n?.defaultLocale ?? sitemapProfile.site.defaults.lang,
            ).copy,
            htmlSitemap: {
              nonce: sitemapNonce,
              pages: sitemapPatterns.map(({ locale, pattern }) => {
                const resolved = resolveSitemapOptions(sitemapProfile, locale);
                return {
                  locale,
                  pathname: `${pattern.replace(/^\//u, "")}/`,
                  href: resolved.href,
                  copy: resolved.copy,
                };
              }),
            },
          });
          const report = leftOutReport(result.left);
          logger.info(
            `${result.files.join(", ")} written${seoOutputs.sitemap ? ` (${result.entries.length} URLs; ${result.skipped} pages left out${report.summary ? `: ${report.summary}` : ""})` : ""}`,
          );
          if (result.pages.length)
            logger.info(
              `HTML sitemap filled: ${result.pages.map((page) => `${page.name} (${page.rows} rows)`).join(", ")}`,
            );
          if (report.warning) logger.warn(report.warning);
          for (const line of report.details) logger.debug(line);
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
        if (seoBuild) {
          if (seoOutputs.sitemap && !config.site)
            throw new TypeError(missingSiteMessage());
          for (const name of ["sitemap.xml", "sitemap.xsl", "robots.txt"]) {
            const file = reservedOutput(name, seoOutputs, "/");
            if (
              file &&
              config.publicDir &&
              existsSync(new URL(file, config.publicDir))
            )
              throw new TypeError(collisionMessage(file, `public/${file}`));
          }
          // Hooks run in integration order: a writer listed after this one
          // would replace the files, one listed before is caught at write.
          for (const { name, file } of competingIntegrations(
            config.integrations,
            seoOutputs,
          ))
            throw new TypeError(
              collisionMessage(file, `the integration ${name}`),
            );
          seoBuild.config = {
            site: config.site,
            base: config.base,
            trailingSlash: config.trailingSlash,
          };
        }
        const i18n = resolveI18n(config.i18n, site);
        placementProfile = {
          ...placementOptions,
          site,
          i18n,
          active,
          base: config.base,
          trailingSlash: config.trailingSlash,
          types: plugins.flatMap((plugin) =>
            plugin.contentTypes.map((type) => type.id),
          ),
          typeCollections: Object.fromEntries(
            plugins.flatMap((plugin) =>
              plugin.contentTypes.map((type) => [type.id, type.collection]),
            ),
          ),
          taxonomies: registry.taxonomies.map((taxonomy) => taxonomy.id),
          hostContentConfig:
            ["content.config.ts", "content.config.js", "content.config.mjs"]
              .map((name) => new URL(name, config.srcDir))
              .filter((url) => existsSync(url))
              .map(fileURLToPath)[0] ?? null,
        };
        validatePlacementRegistry(placementProfile);
        injectTypes({
          filename: "placements-context.d.ts",
          content: `declare module "virtual:wpmoo-astro/placements" { const profile: any; export default profile; export const factories: Record<string, import("astro/runtime/server/index.js").AstroComponentFactory>; export const collections: Record<string, unknown>; export function getAssignedTerms(entry: unknown, type: string | undefined, locale: string): Promise<import("@wpmoo/astro/placements").PlacementPlan["context"]["assignedTerms"]>; export function getKnownTerms(id: string): Promise<{ id: string }[]>; export function getChrome(input: unknown): Promise<import("@wpmoo/astro/placements").PlacementPlan["chrome"]>; }`,
        });
        sitemapProfile = {
          site,
          base: config.base,
          trailingSlash: config.trailingSlash,
          i18n,
          active,
          development: commandName === "dev",
          nonce: sitemapNonce,
          sitemap: sitemapCopy,
        };
        for (const locale of i18n?.locales ?? [site.defaults.lang])
          resolveSitemapOptions(sitemapProfile, locale);
        // A public file at a sitemap page would be replaced or replace it.
        // Only the file the build format writes collides: with "directory"
        // a public sitemap.html is another URL than /sitemap/.
        const pageFile = (path) =>
          (config.build?.format ?? "directory") === "directory"
            ? `${path}/index.html`
            : `${path}.html`;
        for (const { pattern } of sitemapPatterns)
          for (const name of [pageFile(pattern.slice(1))])
            if (config.publicDir && existsSync(new URL(name, config.publicDir)))
              throw new TypeError(
                collisionMessage(`${pattern}/`, `public/${name}`),
              );
        injectTypes({
          filename: "sitemap-context.d.ts",
          content: `declare module ${JSON.stringify(sitemapVirtualId)} { const profile: { site: import("@wpmoo/astro/config").SiteConfig; base: string; trailingSlash: "always" | "never" | "ignore"; i18n: import("@wpmoo/astro/context").SiteContext["i18n"]; active: boolean; development: boolean; nonce: string; sitemap: { messages: Readonly<Record<string, Readonly<Record<string, string>>>> }; staticPaths: readonly string[] }; export default profile; export const loadContent: null | (() => Promise<[typeof import("astro:content"), typeof import("@wpmoo/astro/context")]>); }`,
        });
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
    readonly navigation: readonly { readonly label: string; readonly path: string; readonly match: "exact" | "prefix"; readonly order?: number }[];
    readonly projectionFile: string | null;
    readonly errorPatterns: readonly string[];
    readonly sitemapPatterns: readonly string[];
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
            sitemapPatterns: sitemapPatterns.map((claim) => claim.pattern),
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
              // Route patterns are relative to basePath; only "/" + "/" is the site root.
              rootRoute: plugin.basePath === "/" && plugin.routes.some((route) => route.pattern === "/"),
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
