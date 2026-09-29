import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineSite } from "../config/index.js";
import { page } from "../plugins/page/index.js";
import { buildRegistry, validateResolvedRoutes } from "./registry.js";

const virtualId = "virtual:wpmoo-astro/routes";
const resolvedVirtualId = "\0virtual:wpmoo-astro/routes";
const facadePath = fileURLToPath(new URL("../context/index.js", import.meta.url));

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
  const plugins = input.plugins ?? [page()];
  const registry = buildRegistry(plugins);
  let context = null;
  return {
    name: "@wpmoo/astro",
    hooks: {
      "astro:config:setup": ({ command, injectRoute, updateConfig, addMiddleware }) => {
        for (const route of registry.routes) injectRoute({ pattern: route.pattern, entrypoint: route.entrypoint, prerender: route.prerender });
        if (!plugins.length) return;
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
          entrypoint: new URL("./routes/[...probe].astro", import.meta.url),
          prerender: true,
        });
      },
      "astro:routes:resolved": ({ routes }) => {
        validateResolvedRoutes(registry, routes);
      },
      "astro:config:done": ({ config }) => {
        const files = ["content.config.ts", "content.config.mts", "content.config.js", "content.config.mjs"]
          .map((name) => new URL(name, config.srcDir))
          .filter((url) => existsSync(fileURLToPath(url)));
        if (plugins.length && files.length !== 1) {
          throw new TypeError(`moo requires exactly one host content.config file in ${fileURLToPath(config.srcDir)}`);
        }
        context = { hostContentConfig: files.length ? fileURLToPath(files[0]) : null, privateData: {
          root: config.root.href,
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
