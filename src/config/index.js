import { z } from "astro/zod";

const width = z.enum(["base", "sm", "md", "lg", "xl", "xxl", "fluid"]);
const sidebarSchema = z.strictObject({
  side: z.enum(["left", "right"]).optional(),
  variant: z.enum(["sidebar", "floating", "inset"]).optional(),
  collapsible: z.enum(["icon", "offcanvas", "none"]).optional(),
  rail: z.boolean().optional(),
  defaultOpen: z.boolean().optional(),
});

export const layoutSchema = z.strictObject({
  navigation: z.enum(["sidebar", "none"]).optional(),
  shellMode: z.enum(["viewport", "contained"]).optional(),
  pageWidth: width.optional(),
  headerWidth: width.nullable().optional(),
  theme: z.enum(["light", "dark"]).optional(),
  lang: z.string().trim().min(1).optional(),
  dir: z.enum(["ltr", "rtl"]).optional(),
  sidebar: sidebarSchema.optional(),
});

const typeSchema = layoutSchema.extend({
  views: z.strictObject({
    single: layoutSchema.optional(),
    archive: layoutSchema.optional(),
  }).optional(),
});

const siteSchema = z.strictObject({
  brand: z.string().trim().min(1).optional(),
  defaults: layoutSchema.optional(),
  types: z.record(z.string(), typeSchema).optional(),
});

const typeIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const builtIn = Object.freeze({
  navigation: "sidebar",
  shellMode: "viewport",
  pageWidth: "xl",
  headerWidth: null,
  theme: "light",
  lang: "en",
  dir: "ltr",
  sidebar: Object.freeze({
    side: "left",
    variant: "sidebar",
    collapsible: "icon",
    rail: true,
    defaultOpen: true,
  }),
});

function plainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, label, allowed) {
  if (!plainRecord(value)) throw new TypeError(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new TypeError(`${label}.${key} is not supported`);
  }
}

function parse(schema, value, label) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = [...issue.path, ...(issue.keys ?? [])].join(".");
  throw new TypeError(`${label}${path ? `.${path}` : ""}: ${issue.message}`);
}

function copyLayout(options) {
  return { ...options, ...(options.sidebar ? { sidebar: { ...options.sidebar } } : {}) };
}

function freezeLayout(options) {
  if (options.sidebar) Object.freeze(options.sidebar);
  return Object.freeze(options);
}

function mergeLayout(...layers) {
  const output = { ...builtIn, sidebar: { ...builtIn.sidebar } };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (key === "sidebar") Object.assign(output.sidebar, value);
      else if (key === "views") continue;
      else output[key] = value;
    }
  }
  return freezeLayout(output);
}

export function defineSite(input = {}) {
  requireRecord(input, "site", ["brand", "defaults", "types"]);
  if (input.types !== undefined) {
    if (!plainRecord(input.types)) throw new TypeError("site.types must be a plain object");
    for (const type of Object.keys(input.types)) {
      if (!typeIdPattern.test(type)) throw new TypeError(`site.types.${type} is not a valid type ID`);
    }
  }
  const parsed = parse(siteSchema, input, "site");
  const types = Object.create(null);
  for (const [key, value] of Object.entries(parsed.types ?? {})) {
    const type = copyLayout(value);
    if (value.views) {
      type.views = Object.freeze(Object.fromEntries(
        Object.entries(value.views).map(([view, options]) => [view, freezeLayout(copyLayout(options))]),
      ));
    }
    types[key] = Object.freeze(type);
  }
  return Object.freeze({
    brand: parsed.brand ?? "Moo UI",
    defaults: mergeLayout(parsed.defaults),
    types: Object.freeze(types),
  });
}

export function resolvePageOptions(site, type, view, page) {
  if (!typeIdPattern.test(type)) throw new TypeError(`Invalid content type: ${String(type)}`);
  if (view !== "single" && view !== "archive") throw new TypeError(`Invalid view: ${String(view)}`);
  requireRecord(site, "site", ["brand", "defaults", "types"]);
  const parsedPage = parse(layoutSchema, page ?? {}, "page");
  const selected = Object.hasOwn(site.types, type) ? site.types[type] : undefined;
  return mergeLayout(site.defaults, selected, selected?.views?.[view], parsedPage);
}

function validIdentifier(value, label) {
  if (typeof value !== "string" || !typeIdPattern.test(value)) {
    throw new TypeError(`${label} must be a lowercase kebab ID`);
  }
  return value;
}

function identityKey(id, source) {
  if (typeof id !== "string" || id.length === 0) throw new TypeError("entry id must be nonempty");
  const simple = source === "markdown"
    ? /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/.exec(id)?.[1]
    : typeIdPattern.test(id) ? id : undefined;
  if (simple) return simple;
  return `id--${id.replace(/[^A-Za-z0-9-]/g, (unit) =>
    `_${unit.charCodeAt(0).toString(16).padStart(4, "0")}_`)}`;
}

function typeMarker(type) {
  return type === "page" || type === "post" ? type : `type-${type}`;
}

function taxonomyMarker(taxonomy) {
  return taxonomy === "category" || taxonomy === "tag" ? taxonomy : `tax-${taxonomy}`;
}

function termMarker(taxonomy, term) {
  return taxonomy === "category" || taxonomy === "tag"
    ? `${taxonomy}-${term}`
    : `tax-${taxonomy}--${term}`;
}

function compareCodepoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function getEntryClasses(context) {
  requireRecord(context, "entryContext", ["type", "id", "source", "taxonomies"]);
  const type = validIdentifier(context.type, "entryContext.type");
  if (context.source !== "markdown" && context.source !== "json") {
    throw new TypeError("entryContext.source must be markdown or json");
  }
  const key = identityKey(context.id, context.source);
  const classes = [typeMarker(type), type === "page" || type === "post"
    ? `${type}-${key}` : `entry-${type}--${key}`];
  if (context.taxonomies !== undefined) {
    if (!plainRecord(context.taxonomies)) throw new TypeError("entryContext.taxonomies must be a plain object");
    for (const taxonomy of Object.keys(context.taxonomies).sort(compareCodepoint)) {
      validIdentifier(taxonomy, "entryContext.taxonomies");
      const terms = context.taxonomies[taxonomy];
      if (!Array.isArray(terms)) throw new TypeError(`entryContext.taxonomies.${taxonomy} must be an array`);
      const seen = new Set();
      for (const term of terms) {
        validIdentifier(term, `entryContext.taxonomies.${taxonomy}`);
        if (seen.has(term)) throw new TypeError(`entryContext.taxonomies.${taxonomy} has duplicate term ${term}`);
        seen.add(term);
      }
      for (const term of [...seen].sort(compareCodepoint)) classes.push(termMarker(taxonomy, term));
    }
  }
  return Object.freeze(classes);
}

export function getPageClasses(context) {
  if (context === undefined) return Object.freeze([]);
  requireRecord(context, "pageContext", ["view", "entry", "type", "taxonomy", "term", "key"]);
  switch (context.view) {
    case "single": {
      requireRecord(context, "pageContext", ["view", "entry"]);
      const entryClasses = getEntryClasses(context.entry);
      return Object.freeze(context.entry.type === "page" ? [...entryClasses] : ["single", ...entryClasses]);
    }
    case "archive": {
      requireRecord(context, "pageContext", ["view", "type"]);
      return Object.freeze(["archive", typeMarker(validIdentifier(context.type, "pageContext.type"))]);
    }
    case "taxonomy": {
      requireRecord(context, "pageContext", ["view", "taxonomy", "term"]);
      const taxonomy = validIdentifier(context.taxonomy, "pageContext.taxonomy");
      const term = validIdentifier(context.term, "pageContext.term");
      return Object.freeze(["archive", taxonomyMarker(taxonomy), termMarker(taxonomy, term)]);
    }
    case "native": {
      requireRecord(context, "pageContext", ["view", "key"]);
      return Object.freeze(["page", `route-${identityKey(context.key, "json")}`]);
    }
    default:
      throw new TypeError(`pageContext.view is unsupported: ${String(context.view)}`);
  }
}

const latin = new Map(Object.entries({
  ø: "o", Ø: "o", ł: "l", Ł: "l", đ: "d", Đ: "d", ð: "d", Ð: "d",
  þ: "th", Þ: "th", æ: "ae", Æ: "ae", œ: "oe", Œ: "oe", ı: "i",
  ß: "ss", ẞ: "ss",
}));

function language(options) {
  if (options === undefined) return "en";
  requireRecord(options, "options", ["lang"]);
  const lang = options.lang ?? "en";
  if (typeof lang !== "string" || !lang.trim()) throw new TypeError("options.lang is invalid");
  try {
    return new Intl.Locale(lang).language;
  } catch {
    throw new TypeError(`options.lang is invalid: ${lang}`);
  }
}

function assertValidUnicode(input) {
  for (let i = 0; i < input.length; i += 1) {
    const unit = input.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = input.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError("slug has invalid Unicode");
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError("slug has invalid Unicode");
    }
  }
}

export function normalizeSlug(input, options) {
  const lang = language(options);
  if (typeof input !== "string" || !input.length) throw new TypeError("slug must be nonempty text");
  assertValidUnicode(input);
  if (/[\\?#%\x00-\x1f\x7f]/u.test(input)) throw new TypeError(`slug has unsafe input: ${input}`);
  const segments = input.split("/");
  return segments.map((raw) => {
    if (/[\\/?#%]/u.test(raw.normalize("NFKC"))) {
      throw new TypeError(`slug has unsafe compatibility segment: ${raw}`);
    }
    if (!raw || raw === "." || raw === ".." || [".", ".."].includes(raw.normalize("NFKC"))) {
      throw new TypeError(`slug has unsafe segment: ${raw}`);
    }
    let value = raw.normalize("NFC");
    if (lang === "de") value = value.replace(/[äÄöÖüÜ]/gu, (letter) => ({
      ä: "ae", Ä: "Ae", ö: "oe", Ö: "Oe", ü: "ue", Ü: "Ue",
    })[letter]);
    value = [...value].map((letter) => latin.get(letter) ?? letter).join("");
    value = value.normalize("NFKD").replace(/\p{M}/gu, "");
    if (/[^\x00-\x7f]/u.test(value)) throw new TypeError(`slug requires an explicit ASCII value: ${raw}`);
    const result = value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
    if (!typeIdPattern.test(result)) throw new TypeError(`slug has no valid ASCII segment: ${raw}`);
    return result;
  }).join("/");
}
