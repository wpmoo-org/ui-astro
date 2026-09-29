import { getCollection } from "astro:content";
import context, { collections } from "virtual:wpmoo-astro/routes";
import { validateJsonDirectorySource, validateJsonFileSource, validateMarkdownSource, validateSelectedCollections } from "../content/integrity.js";
import { siteHref } from "../content/paths.js";
import { navigationFromPages } from "../integration/navigation.js";
import { pageHrefFromEntry } from "../plugins/page/paths.js";
import { getPublishedPages } from "../plugins/page/queries.js";

export function getSiteContext() {
  const { site, base, trailingSlash, plugins } = context;
  return Object.freeze({ site, base, trailingSlash, plugins });
}

function reservedPrefixes(typeId) {
  return context.plugins
    .filter((plugin) => plugin.id !== typeId && plugin.basePath !== "/")
    .map((plugin) => plugin.basePath);
}

export function getEntryHref(typeId, entry) {
  const type = context.plugins.flatMap((plugin) => plugin.contentTypes)
    .find((item) => item.id === typeId);
  if (!type) throw new TypeError(`Content type ${String(typeId)} is not active`);
  if (!entry || entry.collection !== type.collection) {
    throw new TypeError(`${typeId} entry must belong to collection ${type.collection}`);
  }
  if (typeId !== "page") throw new TypeError(`${typeId} has no canonical href mapper`);
  const path = pageHrefFromEntry(entry, {
    lang: context.site.defaults.lang,
    reservedPrefixes: reservedPrefixes(typeId),
  });
  return siteHref(path, context);
}

export async function getSiteNavigation(currentPath) {
  const activePage = context.plugins.some((plugin) => plugin.id === "page" &&
    plugin.contentTypes.some((type) => type.id === "page" && type.collection === "page"));
  const pages = activePage ? await getPublishedPages() : [];
  return navigationFromPages(pages, currentPath, {
    lang: context.site.defaults.lang,
    base: context.base,
    trailingSlash: context.trailingSlash,
    reservedPrefixes: reservedPrefixes("page"),
  });
}

export async function validateSiteContent() {
  validateSelectedCollections(collections, context.sources.map((source) => source.collection));
  for (const source of context.sources) {
    const common = {
      collection: source.collection,
      root: new URL(context.root),
      entries: await getCollection(source.collection),
    };
    if (source.kind === "markdown") {
      await validateMarkdownSource({ ...common, base: new URL(source.base), formats: source.formats });
    } else if (source.kind === "json-directory") {
      await validateJsonDirectorySource({ ...common, base: new URL(source.base), schema: collections[source.collection].schema });
    } else if (source.kind === "json") {
      await validateJsonFileSource({ ...common, file: new URL(source.file), schema: collections[source.collection].schema });
    } else {
      throw new TypeError(`${source.collection} source kind ${source.kind} is unsupported by this integrity gate`);
    }
  }
}
