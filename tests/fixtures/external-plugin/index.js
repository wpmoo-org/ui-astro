import { definePlugin } from "@wpmoo/astro/plugins";

export function sample(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Sample options must be a record");
  }
  for (const key of Object.keys(options)) {
    if (!["source", "sourceKind", "taxonomies"].includes(key))
      throw new TypeError(`Sample option ${key} is unsupported`);
  }
  const sourceKind = options.sourceKind ?? "json";
  if (sourceKind !== "json" && sourceKind !== "json-directory")
    throw new TypeError("Sample sourceKind must be json or json-directory");
  return definePlugin({
    apiVersion: 1,
    id: "sample",
    label: "Samples",
    basePath: "/sample",
    contentTypes: [
      {
        id: "sample",
        collection: "sample",
        singleRoute: "single",
        source:
          sourceKind === "json"
            ? { kind: "json", file: options.source }
            : { kind: "json-directory", base: options.source },
        taxonomies: options.taxonomies ?? [],
      },
    ],
    routes: [
      {
        id: "archive",
        pattern: "/",
        prerender: true,
        entrypoint: new URL("./routes/index.astro", import.meta.url),
      },
      {
        id: "single",
        pattern: "/[...slug]",
        prerender: true,
        entrypoint: new URL("./routes/[...slug].astro", import.meta.url),
      },
    ],
    navigation: [{ label: "Samples", path: "/sample", match: "prefix" }],
  });
}
