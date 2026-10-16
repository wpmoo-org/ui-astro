import { definePlugin } from "../index.js";

function plainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function page(options = {}) {
  if (!plainRecord(options))
    throw new TypeError("Page options must be a plain object");
  for (const key of Object.keys(options)) {
    if (
      !["source", "formats", "taxonomies", "routes", "locales"].includes(key)
    ) {
      throw new TypeError(`Page option ${key} is unsupported`);
    }
  }
  const routes = options.routes ?? {};
  if (!plainRecord(routes))
    throw new TypeError("Page routes must be a plain object");
  for (const key of Object.keys(routes)) {
    if (key !== "single")
      throw new TypeError(`Page routes.${key} is unsupported`);
  }
  const owner = routes.single ?? "plugin";
  if (owner !== "plugin" && owner !== "host") {
    throw new TypeError("Page routes.single must be plugin or host");
  }
  return definePlugin({
    apiVersion: 1,
    id: "page",
    label: "Pages",
    basePath: "/",
    ...(options.locales ? { locales: options.locales } : {}),
    contentTypes: [
      {
        id: "page",
        collection: "page",
        singleRoute: "single",
        source: {
          kind: "markdown",
          ...(options.source === undefined ? {} : { base: options.source }),
          formats: options.formats ?? ["md"],
        },
        taxonomies: options.taxonomies ?? [],
      },
    ],
    routes: [
      {
        id: "single",
        pattern: "/[...slug]",
        prerender: true,
        owner,
        ...(owner === "plugin"
          ? { entrypoint: new URL("./routes/[...slug].astro", import.meta.url) }
          : {}),
      },
    ],
  });
}
