import { fileURLToPath } from "node:url";

export const placementLocations = Object.freeze([
  "header.before",
  "header.after",
  "content.before",
  "content.after",
  "entry.before-content",
  "entry.after-content",
  "entry.taxonomies",
  "archive.before-list",
  "archive.after-list",
  "aside.content",
  "footer.before",
  "footer.after",
]);
export const builtInBlocks = Object.freeze(["toc", "entry-taxonomies"]);
const views = ["home", "single", "archive", "taxonomy", "native", "not-found"];
const forbidden = ["__proto__", "prototype", "constructor"];
const identifier = /^[A-Za-z][A-Za-z0-9_-]*$/u;

export function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function record(value, name, keys) {
  if (!plainRecord(value))
    throw new TypeError(`${name} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (forbidden.includes(key) || (keys && !keys.includes(key)))
      throw new TypeError(`${name}.${key} is unsupported`);
  }
  return value;
}
export function text(value, name) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    /[\x00-\x1f\x7f]/u.test(value)
  )
    throw new TypeError(`${name} must be nonempty plain text`);
  return value;
}
export function array(value, name, { empty = false } = {}) {
  if (
    !Array.isArray(value) ||
    (!empty && !value.length) ||
    Array.from({ length: value.length }, (_, i) => i).some(
      (i) => !Object.hasOwn(value, i),
    )
  )
    throw new TypeError(
      `${name} must be a dense${empty ? "" : " nonempty"} array`,
    );
  return value;
}
export function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function json(value, name, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || seen.has(value))
    throw new TypeError(`${name} must contain only finite JSON data`);
  seen.add(value);
  let result;
  if (Array.isArray(value))
    result = array(value, name, { empty: true }).map((child) =>
      json(child, name, seen),
    );
  else
    result = Object.fromEntries(
      Object.entries(record(value, name)).map(([key, child]) => [
        key,
        json(child, `${name}.${key}`, seen),
      ]),
    );
  seen.delete(value);
  return result;
}
function conditions(input, name) {
  if (input === undefined) return undefined;
  record(input, name, [
    "views",
    "types",
    "locales",
    "entries",
    "translationKeys",
    "terms",
  ]);
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (key === "terms") {
        record(value, `${name}.terms`);
        return [
          key,
          Object.fromEntries(
            Object.entries(value).map(([id, ids]) => {
              if (!identifier.test(id))
                throw new TypeError(`${name}.terms has an invalid taxonomy ID`);
              return [
                id,
                array(ids, `${name}.terms.${id}`).map((id) => text(id, name)),
              ];
            }),
          ),
        ];
      }
      const list = array(value, `${name}.${key}`).map((value) =>
        text(value, name),
      );
      if (key === "views" && list.some((view) => !views.includes(view)))
        throw new TypeError(`${name}.views is unsupported`);
      return [key, list];
    }),
  );
}

export function normalizePlacements(input = {}) {
  record(input, "placements input", ["blocks", "placements"]);
  const blocks = Object.create(null);
  for (const [id, definition] of Object.entries(
    record(input.blocks ?? {}, "blocks"),
  )) {
    if (!identifier.test(id) || forbidden.includes(id))
      throw new TypeError(`Invalid block ID ${id}`);
    if (builtInBlocks.includes(id))
      throw new TypeError(`Block ${id} is reserved`);
    record(definition, `block ${id}`, [
      "component",
      "collection",
      "translationKey",
    ]);
    if (definition.component !== undefined) {
      if (
        !(definition.component instanceof URL) ||
        definition.component.protocol !== "file:" ||
        definition.component.search ||
        definition.component.hash ||
        !definition.component.pathname.endsWith(".astro") ||
        definition.collection !== undefined ||
        definition.translationKey !== undefined
      )
        throw new TypeError(
          `Block ${id}.component requires a file URL to an Astro component`,
        );
      blocks[id] = {
        kind: "component",
        path: fileURLToPath(definition.component),
      };
    } else {
      text(definition.collection, `block ${id}.collection`);
      text(definition.translationKey, `block ${id}.translationKey`);
      blocks[id] = {
        kind: "content",
        collection: definition.collection,
        translationKey: definition.translationKey,
      };
    }
  }
  const ids = new Set();
  const placements = array(input.placements ?? [], "placements", {
    empty: true,
  }).map((value) => {
    record(value, "placement", [
      "id",
      "block",
      "at",
      "order",
      "include",
      "exclude",
      "props",
      "mode",
    ]);
    const id = text(value.id, "placement.id");
    if (!identifier.test(id) || forbidden.includes(id))
      throw new TypeError(`Invalid placement ID ${id}`);
    if (ids.has(id)) throw new TypeError(`Duplicate placement ID ${id}`);
    ids.add(id);
    if (
      !builtInBlocks.includes(value.block) &&
      !Object.hasOwn(blocks, value.block)
    )
      throw new TypeError(
        `Placement ${id} refers to unknown block ${value.block}`,
      );
    if (!placementLocations.includes(value.at))
      throw new TypeError(
        `Placement ${id} has unsupported location ${value.at}`,
      );
    const order = value.order ?? 10;
    if (!Number.isSafeInteger(order))
      throw new TypeError(
        `Placement ${id}.order must be a finite safe integer`,
      );
    const mode = value.mode ?? "append";
    if (
      !["append", "replace"].includes(mode) ||
      (mode === "replace" && value.at !== "entry.taxonomies")
    )
      throw new TypeError(`Placement ${id}.mode is unsupported at ${value.at}`);
    const props = json(
      record(value.props ?? {}, `placement ${id}.props`),
      `placement ${id}.props`,
    );
    for (const key of ["context", "instanceId", "links"]) {
      if (Object.hasOwn(props, key))
        throw new TypeError(`Placement ${id}.props.${key} is reserved`);
    }
    return {
      id,
      block: value.block,
      at: value.at,
      order,
      mode,
      props,
      include: conditions(value.include, `placement ${id}.include`),
      exclude: conditions(value.exclude, `placement ${id}.exclude`),
    };
  });
  return freeze({ blocks, placements });
}
