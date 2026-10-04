import { archiveBasePath } from "./urls.js";

const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function record(value, field, keys) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new TypeError(`${field} must be a plain object`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key))
      throw new TypeError(`${field}.${key} is unsupported`);
  }
}

export function defineTaxonomy(input) {
  record(input, "taxonomy", [
    "id",
    "label",
    "source",
    "sourceKind",
    "hierarchical",
    "archive",
    "locales",
  ]);
  if (typeof input.id !== "string" || !identifier.test(input.id)) {
    throw new TypeError("taxonomy.id must be a lowercase kebab ID");
  }
  if (
    typeof input.label !== "string" ||
    !input.label.trim() ||
    /[\x00-\x1f\x7f]/u.test(input.label)
  ) {
    throw new TypeError("taxonomy.label must be nonempty plain text");
  }
  const sourceKind = input.sourceKind ?? "json";
  if (sourceKind !== "json" && sourceKind !== "json-directory")
    throw new TypeError("taxonomy.sourceKind must be json or json-directory");
  const source = input.source;
  if (
    !(source instanceof URL) ||
    source.protocol !== "file:" ||
    source.host ||
    source.search ||
    source.hash ||
    (sourceKind === "json"
      ? !source.pathname.endsWith(".json")
      : !source.pathname.endsWith("/"))
  ) {
    throw new TypeError(
      `taxonomy.source must be a local ${sourceKind === "json" ? "JSON file" : "directory URL ending in /"}`,
    );
  }
  const hierarchical = input.hierarchical ?? false;
  if (typeof hierarchical !== "boolean")
    throw new TypeError("taxonomy.hierarchical must be boolean");
  let archive = false;
  if (input.archive !== undefined && input.archive !== false) {
    record(input.archive, "taxonomy.archive", ["include", "basePath"]);
    const include = input.archive.include ?? "direct";
    if (include !== "direct" && include !== "descendants")
      throw new TypeError(
        "taxonomy.archive.include must be direct or descendants",
      );
    if (include === "descendants" && !hierarchical)
      throw new TypeError(
        "taxonomy.archive.include descendants requires hierarchical: true",
      );
    archive = Object.freeze({
      include,
      ...(input.archive.basePath === undefined
        ? {}
        : {
            basePath: archiveBasePath(
              input.archive.basePath,
              "taxonomy.archive.basePath",
            ),
          }),
    });
  }
  let locales;
  if (input.locales !== undefined) {
    record(input.locales, "taxonomy.locales", Object.keys(input.locales));
    locales = Object.fromEntries(
      Object.entries(input.locales).map(([locale, value]) => {
        try {
          if (Intl.getCanonicalLocales(locale).length !== 1) throw new Error();
        } catch {
          throw new TypeError(
            `taxonomy.locales.${locale} must be a valid locale`,
          );
        }
        record(value, `taxonomy.locales.${locale}`, [
          "label",
          "slug",
          "basePath",
        ]);
        const field = `taxonomy.locales.${locale}`;
        const basePath =
          value.basePath === undefined
            ? undefined
            : archiveBasePath(value.basePath, `${field}.basePath`);
        if (basePath !== undefined && !archive)
          throw new TypeError(`${field}.basePath requires an enabled archive`);
        if (
          value.slug !== undefined &&
          (basePath !== undefined || archive.basePath !== undefined)
        )
          throw new TypeError(
            `${field}.slug competes with explicit basePath; use basePath to choose the complete prefix`,
          );
        if (
          value.label !== undefined &&
          (typeof value.label !== "string" ||
            !value.label.trim() ||
            /[\x00-\x1f\x7f]/u.test(value.label))
        )
          throw new TypeError(
            `taxonomy.locales.${locale}.label must be plain text`,
          );
        if (
          value.slug !== undefined &&
          (typeof value.slug !== "string" || !identifier.test(value.slug))
        )
          throw new TypeError(
            `taxonomy.locales.${locale}.slug must be a canonical URL segment`,
          );
        return [
          locale,
          Object.freeze({
            ...value,
            ...(basePath === undefined ? {} : { basePath }),
          }),
        ];
      }),
    );
  }
  return Object.freeze({
    id: input.id,
    label: input.label.trim(),
    source: source.href,
    sourceKind,
    hierarchical,
    archive,
    ...(locales ? { locales: Object.freeze(locales) } : {}),
  });
}
