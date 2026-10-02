const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function record(value, field, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${field} must be a plain object`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new TypeError(`${field}.${key} is unsupported`);
  }
}

export function defineTaxonomy(input) {
  record(input, "taxonomy", ["id", "label", "source", "sourceKind", "hierarchical", "archive"]);
  if (typeof input.id !== "string" || !identifier.test(input.id)) {
    throw new TypeError("taxonomy.id must be a lowercase kebab ID");
  }
  if (typeof input.label !== "string" || !input.label.trim() || /[\x00-\x1f\x7f]/u.test(input.label)) {
    throw new TypeError("taxonomy.label must be nonempty plain text");
  }
  const sourceKind = input.sourceKind ?? "json";
  if (sourceKind !== "json" && sourceKind !== "json-directory") throw new TypeError("taxonomy.sourceKind must be json or json-directory");
  const source = input.source;
  if (!(source instanceof URL) || source.protocol !== "file:" || source.host || source.search || source.hash ||
      (sourceKind === "json" ? !source.pathname.endsWith(".json") : !source.pathname.endsWith("/"))) {
    throw new TypeError(`taxonomy.source must be a local ${sourceKind === "json" ? "JSON file" : "directory URL ending in /"}`);
  }
  const hierarchical = input.hierarchical ?? false;
  if (typeof hierarchical !== "boolean") throw new TypeError("taxonomy.hierarchical must be boolean");
  let archive = false;
  if (input.archive !== undefined && input.archive !== false) {
    record(input.archive, "taxonomy.archive", ["include"]);
    const include = input.archive.include ?? "direct";
    if (include !== "direct" && include !== "descendants") throw new TypeError("taxonomy.archive.include must be direct or descendants");
    if (include === "descendants" && !hierarchical) throw new TypeError("taxonomy.archive.include descendants requires hierarchical: true");
    archive = Object.freeze({ include });
  }
  return Object.freeze({ id: input.id, label: input.label.trim(), source: source.href, sourceKind, hierarchical, archive });
}
