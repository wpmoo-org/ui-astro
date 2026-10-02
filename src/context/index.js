import context, { collections } from "virtual:wpmoo-astro/routes";
import { validateJsonDirectorySource, validateJsonFileSource, validateMarkdownSource, validateSelectedCollections } from "../content/integrity.js";
import { entryPath, siteHref } from "../content/paths.js";
import { navigationFromDescriptors, navigationFromPages } from "../integration/navigation.js";
import { pageHrefFromEntry, pagePathsFromEntries } from "../plugins/page/paths.js";
import { getPublishedPages } from "../plugins/page/queries.js";
import { postPathsFromEntries } from "../plugins/post/paths.js";
import { validateReferences, validateTerms } from "../taxonomies/paths.js";

function freezeData(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}

const publicContext = freezeData({
  site: context.site, base: context.base,
  trailingSlash: context.trailingSlash, plugins: context.plugins,
  taxonomies: context.taxonomies, taxonomyBasePath: context.taxonomyBasePath,
});

export function getSiteContext() {
  return publicContext;
}

function reservedPrefixes(typeId) {
  return [...context.plugins
    .filter((plugin) => !plugin.contentTypes.some(type => type.id === typeId) && plugin.basePath !== "/")
    .map((plugin) => plugin.basePath),
    ...(context.taxonomies.some(taxonomy => taxonomy.archive) ? [context.taxonomyBasePath] : [])];
}

export function getEntryHref(typeId, entry) {
  const type = context.plugins.flatMap((plugin) => plugin.contentTypes)
    .find((item) => item.id === typeId);
  if (!type) throw new TypeError(`Content type ${String(typeId)} is not active`);
  if (!entry || entry.collection !== type.collection) {
    throw new TypeError(`${typeId} entry must belong to collection ${type.collection}`);
  }
  if (entry.data?.status !== "publish") throw new TypeError(`${typeId} entry ${entry.id} must be publish to have a public href`);
  const path = typeId === "page" ? pageHrefFromEntry(entry, {
    lang: context.site.defaults.lang,
    reservedPrefixes: reservedPrefixes(typeId),
  }) : entryPath(entry, {
    type: typeId, prefix: context.singlePrefixes[typeId],
    sourceKind: type.sourceKind, lang: context.site.defaults.lang,
  }).href;
  return siteHref(path, context);
}

export async function getSiteNavigation(currentPath) {
  const activePage = context.plugins.some((plugin) => plugin.id === "page" &&
    plugin.contentTypes.some((type) => type.id === "page" && type.collection === "page"));
  const pages = activePage ? await getPublishedPages() : [];
  const options = {
    lang: context.site.defaults.lang,
    base: context.base,
    trailingSlash: context.trailingSlash,
    reservedPrefixes: reservedPrefixes("page"),
  };
  return Object.freeze([
    ...navigationFromPages(pages, currentPath, options),
    ...navigationFromDescriptors(context.navigation, currentPath, options),
  ]);
}

export async function validateSiteContent() {
  // Dev middleware survives HMR; query the current native content module.
  const { getCollection } = await import("astro:content");
  validateSelectedCollections(collections, context.sources.map((source) => source.collection));
  const loaded = new Map();
  const terms = new Map();
  for (const source of context.sources) {
    const common = {
      collection: source.collection,
      root: new URL(context.root),
      entries: await getCollection(source.collection),
    };
    loaded.set(source.collection, common.entries);
    if (source.kind === "markdown") {
      await validateMarkdownSource({ ...common, base: new URL(source.base), formats: source.formats, schema: collections[source.collection].schema });
    } else if (source.kind === "json-directory") {
      await validateJsonDirectorySource({ ...common, base: new URL(source.base), schema: collections[source.collection].schema });
    } else if (source.kind === "json") {
      await validateJsonFileSource({ ...common, file: new URL(source.file), schema: collections[source.collection].schema,
        arrayOnly: context.taxonomies.some(taxonomy => taxonomy.id === source.collection) });
    } else {
      throw new TypeError(`${source.collection} source kind ${source.kind} is unsupported by this integrity gate`);
    }
    const taxonomy = context.taxonomies.find(taxonomy => taxonomy.id === source.collection);
    if (taxonomy) terms.set(taxonomy.id, validateTerms(taxonomy, common.entries, { lang: context.site.defaults.lang }));
    if (source.collection === "page") {
      pagePathsFromEntries(common.entries, { lang: context.site.defaults.lang, reservedPrefixes: reservedPrefixes("page") });
    } else if (source.collection === "post") {
      postPathsFromEntries(common.entries, { lang: context.site.defaults.lang, basePath: context.singlePrefixes.post });
    }
  }
  for (const type of context.plugins.flatMap(plugin => plugin.contentTypes)) {
    const entries = loaded.get(type.collection);
    validateReferences(type, entries, terms);
    if (type.id === "page" || type.id === "post") continue;
    const claimed = new Map();
    for (const entry of entries) {
      const path = entryPath(entry, { type: type.id, prefix: context.singlePrefixes[type.id], sourceKind: type.sourceKind, lang: context.site.defaults.lang });
      if (entry.data.status !== "publish" && entry.data.status !== "future") continue;
      const previous = claimed.get(path.href);
      if (previous) throw new TypeError(`${type.id} URL collision: ${previous.id} (${previous.raw}) and ${entry.id} (${path.raw}) both map to ${path.href}`);
      claimed.set(path.href, { id: entry.id, raw: path.raw });
    }
  }
}
