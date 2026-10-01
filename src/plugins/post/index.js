import { definePlugin } from "../index.js";

function plainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function post(options = {}) {
  if (!plainRecord(options)) throw new TypeError("Post options must be a plain object");
  for (const key of Object.keys(options)) {
    if (!["label", "basePath", "source", "formats", "taxonomies", "routes"].includes(key)) {
      throw new TypeError(`Post option ${key} is unsupported`);
    }
  }
  if (options.basePath === "/") throw new TypeError("Post basePath must be a nonroot namespace");
  const basePath = options.basePath ?? "/posts";
  const label = options.label ?? "Posts";
  const owners = options.routes ?? {};
  if (!plainRecord(owners)) throw new TypeError("Post routes must be a plain object");
  for (const key of Object.keys(owners)) {
    if (key !== "single" && key !== "archive") throw new TypeError(`Post routes.${key} is unsupported`);
    if (owners[key] !== "plugin" && owners[key] !== "host") {
      throw new TypeError(`Post routes.${key} must be plugin or host`);
    }
  }
  return definePlugin({
    apiVersion: 1, id: "post", label, basePath,
    contentTypes: [{
      id: "post", collection: "post", singleRoute: "single",
      source: { kind: "markdown", ...(options.source === undefined ? {} : { base: options.source }), formats: options.formats ?? ["md"] },
      taxonomies: options.taxonomies ?? [],
    }],
    routes: [
      { id: "archive", pattern: "/", filename: "index.astro" },
      { id: "single", pattern: "/[...slug]", filename: "[...slug].astro" },
    ].map(({ id, pattern, filename }) => ({
      id, pattern, prerender: true, owner: owners[id] ?? "plugin",
      ...(owners[id] === "host" ? {} : { entrypoint: new URL(`./routes/${filename}`, import.meta.url) }),
    })),
    navigation: [{ label, path: typeof basePath === "string" ? basePath.replace(/\/$/u, "") : basePath, match: "prefix" }],
  });
}
