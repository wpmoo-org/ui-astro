import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineSite } from "../config/index.js";
import { page } from "../plugins/page/index.js";

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
  if (!Array.isArray(plugins)) throw new TypeError("moo.plugins must be an array");
  const ids = new Set();
  const routes = [];
  for (const plugin of plugins) {
    if (!plugin || plugin.apiVersion !== 1 || typeof plugin.id !== "string") {
      throw new TypeError("moo.plugins requires version 1 plugin descriptors");
    }
    if (ids.has(plugin.id)) throw new TypeError(`moo.plugins has duplicate plugin ${plugin.id}`);
    ids.add(plugin.id);
    for (const route of plugin.routes) {
      if (route.owner === "plugin") {
        routes.push({
          owner: plugin.id,
          pattern: plugin.basePath === "/" ? route.pattern : `${plugin.basePath}${route.pattern}`,
          entrypoint: new URL(route.entrypoint),
          prerender: true,
        });
      }
    }
  }
  const finalPatterns = new Set();
  for (const route of routes) {
    if (finalPatterns.has(route.pattern)) throw new TypeError(`moo route pattern ${route.pattern} has multiple owners`);
    finalPatterns.add(route.pattern);
  }
  let context = null;
  return {
    name: "@wpmoo/astro",
    hooks: {
      "astro:config:setup": ({ injectRoute, updateConfig }) => {
        for (const route of routes) injectRoute({ pattern: route.pattern, entrypoint: route.entrypoint, prerender: route.prerender });
        if (!plugins.length) return;
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
      "astro:config:done": ({ config }) => {
        const files = ["content.config.ts", "content.config.mts", "content.config.js", "content.config.mjs"]
          .map((name) => new URL(name, config.srcDir))
          .filter((url) => existsSync(fileURLToPath(url)));
        if (plugins.length && files.length !== 1) {
          throw new TypeError(`moo requires exactly one host content.config file in ${fileURLToPath(config.srcDir)}`);
        }
        context = { hostContentConfig: files.length ? fileURLToPath(files[0]) : null, privateData: {
          root: config.root.href,
          sources: plugins.flatMap((plugin) => plugin.contentTypes.map((type) => ({
            collection: type.collection,
            kind: type.source.kind,
            base: type.source.base ?? new URL(`content/${type.collection}/`, config.srcDir).href,
            formats: type.source.formats ?? [],
          }))),
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
