import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineSite } from "../config/index.js";
import { siteHref } from "../content/paths.js";
import { page } from "../plugins/page/index.js";
import { post } from "../plugins/post/index.js";
import { buildRegistry, validateBuiltPagePaths, validateNativePageRoutes, validateResolvedRoutes } from "./registry.js";

const virtualId = "virtual:wpmoo-astro/routes";
const resolvedVirtualId = "\0virtual:wpmoo-astro/routes";
const facadePath = fileURLToPath(new URL("../context/index.js", import.meta.url));
const integrityEntrypoint = new URL("./routes/[...probe].astro", import.meta.url);

function plainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export default function moo(input = {}) {
  if (!plainRecord(input)) throw new TypeError("moo options must be a plain object");
  for (const key of Object.keys(input)) {
    if (key !== "site" && key !== "plugins") throw new TypeError(`moo.${key} is unsupported`);
  }
  const site = defineSite(input.site);
  const plugins = input.plugins ?? [page(), post()];
  const registry = buildRegistry(plugins);
  let context = null;
  let resolvedRoutes = [];
  let root = null;
  return {
    name: "@wpmoo/astro",
    hooks: {
      "astro:config:setup": ({ config, command, injectRoute, updateConfig, addMiddleware }) => {
        root = config.root;
        // Content sync starts a temporary Vite server during build and sync.
        // Its optimizer must not replace files used by a running dev server.
        if ((command === "build" || command === "sync") && !config.vite.cacheDir) {
          updateConfig({ vite: { cacheDir: fileURLToPath(new URL(`node_modules/.vite/wpmoo-${command}/`, config.root)) } });
        }
        for (const route of registry.routes) injectRoute({ pattern: route.pattern, entrypoint: route.entrypoint, prerender: route.prerender });
        if (!plugins.length) return;
        updateConfig({ prerenderConflictBehavior: "error" });
        if (command === "dev") {
          addMiddleware({ entrypoint: new URL("./middleware.js", import.meta.url), order: "pre" });
        }
        updateConfig({ vite: { plugins: [{
          name: "wpmoo-astro-context",
          resolveId(source, importer, options) {
            if (source !== virtualId) return null;
            if (!options?.ssr) throw new Error(`${virtualId} is server-only`);
            if (importer?.split("?")[0] !== facadePath) throw new Error(`${virtualId} is private to @wpmoo/astro/context`);
            return resolvedVirtualId;
          },
          load(id) {
            if (id !== resolvedVirtualId) return null;
            if (!context) throw new Error(`${virtualId} is unavailable before Astro config resolves`);
            return `import { collections } from ${JSON.stringify(context.hostContentConfig)}; export { collections }; export default ${JSON.stringify(context.privateData)};`;
          },
        }] } });
        injectRoute({
          pattern: "/__moo_content_integrity/[...probe]",
          entrypoint: integrityEntrypoint,
          prerender: true,
        });
      },
      "astro:routes:resolved": ({ routes }) => {
        validateResolvedRoutes(registry, routes);
        if (plugins.length) validateNativePageRoutes(routes, integrityEntrypoint, root);
        resolvedRoutes = routes;
      },
      "astro:build:done": ({ pages }) => {
        if (plugins.length) validateBuiltPagePaths(pages, resolvedRoutes);
      },
      "astro:config:done": ({ config, injectTypes }) => {
        if (config.integrations.filter(integration => integration.name === "@wpmoo/astro").length !== 1) {
          throw new TypeError("@wpmoo/astro must be registered exactly once");
        }
        if (plugins.length) {
          if (config.output !== "static") throw new TypeError("moo requires Astro output: static for active content");
          if (config.prerenderConflictBehavior !== "error") {
            throw new TypeError("moo requires Astro prerenderConflictBehavior: error for active content");
          }
          siteHref("/", { base: config.base, trailingSlash: config.trailingSlash });
        }
        const files = ["content.config.ts", "content.config.mts", "content.config.js", "content.config.mjs"]
          .map((name) => new URL(name, config.srcDir))
          .filter((url) => existsSync(fileURLToPath(url)));
        if (plugins.length && files.length !== 1) {
          throw new TypeError(`moo requires exactly one host content.config file in ${fileURLToPath(config.srcDir)}`);
        }
        if (plugins.length) injectTypes({ filename: "route-context.d.ts", content: `
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
  };
  export const collections: Record<string, ReturnType<typeof import("astro:content").defineCollection>>;
  export default context;
}
` });
        context = { hostContentConfig: files.length ? fileURLToPath(files[0]) : null, privateData: {
          root: config.root.href,
          singlePrefixes: Object.fromEntries(plugins.flatMap(plugin => plugin.contentTypes.map(type => {
            const pattern = plugin.routes.find(route => route.id === type.singleRoute).pattern;
            const prefix = pattern.slice(0, -"/[...slug]".length);
            return [type.id, `${plugin.basePath === "/" ? "" : plugin.basePath}${prefix}`];
          }))),
          navigation: plugins.flatMap(plugin => plugin.navigation),
          sources: registry.contentTypes.map((type) => ({
            collection: type.collection,
            kind: type.source.kind,
            ...(type.source.kind === "json"
              ? { file: type.source.file }
              : { base: type.source.base ?? new URL(`content/${type.collection}/`, config.srcDir).href }),
            formats: type.source.formats ?? [],
          })),
          site,
          base: config.base,
          trailingSlash: config.trailingSlash,
          plugins: plugins.map((plugin) => ({
            id: plugin.id, label: plugin.label, basePath: plugin.basePath,
            contentTypes: plugin.contentTypes.map((type) => ({
              id: type.id, collection: type.collection, sourceKind: type.source.kind,
              formats: type.source.formats ?? [], singleRoute: type.singleRoute,
            })),
          })),
        } };
      },
    },
  };
}
