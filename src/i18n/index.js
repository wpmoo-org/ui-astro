import {
  getEntryHref,
  getSiteContext,
  validateSiteContent,
} from "../context/index.js";
import { siteHref } from "../content/paths.js";
import { languageLinks, translationGraph } from "./graph.js";
import { nativeLocaleHref } from "./href.js";

export function getRouteLocale(routePattern) {
  const { i18n, site } = getSiteContext();
  if (!i18n) return site.defaults.lang;
  if (typeof routePattern !== "string" || !routePattern.startsWith("/"))
    throw new TypeError("routePattern must be an Astro route pattern");
  const prefix = routePattern.split("/")[1];
  const locale = i18n.locales.includes(prefix) ? prefix : i18n.defaultLocale;
  if (i18n.prefixDefaultLocale && !i18n.locales.includes(prefix))
    throw new TypeError(
      `routePattern ${routePattern} requires a native locale prefix`,
    );
  return locale;
}

export function getLocaleHref(path, locale) {
  const { i18n, site, base, trailingSlash } = getSiteContext();
  siteHref(path);
  if (!i18n) {
    if (locale !== site.defaults.lang)
      throw new TypeError(`locale ${locale} is not active`);
    return siteHref(path, { base, trailingSlash });
  }
  if (!i18n.locales.includes(locale))
    throw new TypeError(`locale ${locale} is not active`);
  return nativeLocaleHref(path, locale, { base, trailingSlash });
}

export async function getLanguageLinks(typeId, entry) {
  await validateSiteContent();
  const context = getSiteContext();
  const { getCollection } = await import("astro:content");
  const sources = [];
  for (const type of context.plugins.flatMap((plugin) => plugin.contentTypes)) {
    sources.push({ type, entries: await getCollection(type.collection) });
  }
  const source = sources.find((value) => value.type.id === typeId);
  const current = source?.entries.find(
    (value) => value.id === entry?.id && value.collection === entry?.collection,
  );
  if (
    !current ||
    current.data.status !== "publish" ||
    entry.data.status !== "publish" ||
    current.data.locale !== entry.data.locale ||
    current.data.translationKey !== entry.data.translationKey ||
    current.data.slug !== entry.data.slug
  ) {
    throw new TypeError(
      `${typeId} language links require a current published native entry`,
    );
  }
  return languageLinks(
    translationGraph(
      sources,
      context.i18n,
      context.site.defaults.lang,
      getEntryHref,
    ),
    typeId,
    current,
  );
}
