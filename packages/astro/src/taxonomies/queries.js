import {
  getEntryHref,
  getSiteContext,
  getSiteNavigation,
  validateSiteContent,
} from "../context/index.js";
import { normalizeSlug } from "../config/index.js";
import { termItems, validateTerms } from "./paths.js";
import { resolveTaxonomyArchive, taxonomyTermPath } from "./urls.js";
import { localePath } from "../i18n/profile.js";
import { getLocaleHref, getRouteLocale } from "../i18n/index.js";

function activeTaxonomy(context, id) {
  const taxonomy = context.taxonomies.find((item) => item.id === id);
  if (!taxonomy)
    throw new TypeError(`Taxonomy ${String(id)} is unknown or inactive`);
  return taxonomy;
}

async function inputs(requestedLocale) {
  await validateSiteContent();
  const { getCollection } = await import("astro:content");
  const context = getSiteContext();
  const locale =
    requestedLocale ??
    context.i18n?.defaultLocale ??
    context.site.defaults.lang;
  if (
    context.i18n
      ? !context.i18n.locales.includes(locale)
      : locale !== context.site.defaults.lang
  )
    throw new TypeError(`taxonomy locale ${locale} is not active`);
  const graphs = new Map();
  for (const taxonomy of context.taxonomies) {
    graphs.set(
      taxonomy.id,
      validateTerms(taxonomy, await getCollection(taxonomy.id), {
        lang: locale,
      }),
    );
  }
  return { context, graphs, getCollection, locale };
}

async function sourcesFor(taxonomy, context, getCollection) {
  const sources = [];
  for (const type of context.plugins.flatMap((plugin) => plugin.contentTypes)) {
    if (type.taxonomies.includes(taxonomy.id))
      sources.push({ type, entries: await getCollection(type.collection) });
  }
  return sources;
}

export async function getTaxonomyTerms(taxonomyId, options = {}) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => key !== "locale")
  )
    throw new TypeError("Taxonomy term options support only locale");
  const { context, graphs } = await inputs(options.locale);
  activeTaxonomy(context, taxonomyId);
  return Object.freeze([...graphs.get(taxonomyId).values()]);
}

export async function getTermEntries(taxonomyId, termId, options = {}) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => !["include", "locale"].includes(key))
  )
    throw new TypeError("Term query options support only include and locale");
  const { context, graphs, getCollection, locale } = await inputs(
    options.locale,
  );
  const taxonomy = activeTaxonomy(context, taxonomyId);
  return termItems(
    taxonomy,
    graphs.get(taxonomyId),
    termId,
    await sourcesFor(taxonomy, context, getCollection),
    { ...options, locale: context.i18n ? locale : undefined, getEntryHref },
  );
}

export async function getTaxonomyPaths(options = {}) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) => !["taxonomies", "locale", "routePattern"].includes(key),
    )
  )
    throw new TypeError(
      "Taxonomy path options support only taxonomies, locale and routePattern",
    );
  const routeLocale =
    options.routePattern === undefined
      ? undefined
      : getRouteLocale(options.routePattern);
  if (
    routeLocale !== undefined &&
    options.locale !== undefined &&
    routeLocale !== options.locale
  )
    throw new TypeError(
      `routePattern ${options.routePattern} locale ${routeLocale} disagrees with locale ${options.locale}`,
    );
  const { context, graphs, getCollection, locale } = await inputs(
    routeLocale ?? options.locale,
  );
  const patternFor = (taxonomy) =>
    localePath(
      resolveTaxonomyArchive(taxonomy, {
        lang: locale,
        taxonomyBasePath: context.taxonomyBasePath,
      }).pattern,
      locale,
      context.i18n,
    );
  if (
    options.routePattern !== undefined &&
    !context.taxonomies.some(
      (taxonomy) =>
        taxonomy.archive && patternFor(taxonomy) === options.routePattern,
    )
  )
    throw new TypeError(
      `taxonomy routePattern ${options.routePattern} has no active archive group`,
    );
  const selected =
    options.taxonomies ??
    context.taxonomies
      .filter((taxonomy) => taxonomy.archive)
      .map((taxonomy) => taxonomy.id);
  if (!Array.isArray(selected) || new Set(selected).size !== selected.length)
    throw new TypeError(
      "Taxonomy path selection must contain unique active IDs",
    );
  const localeHome = getLocaleHref("/", locale);
  const navigation = await getSiteNavigation(localeHome, locale);
  const homeHref =
    navigation.find((item) => item.href === localeHome)?.href ??
    navigation[0]?.href;
  const paths = [];
  for (const id of selected) {
    const taxonomy = activeTaxonomy(context, id);
    const routePattern = patternFor(taxonomy);
    if (
      options.routePattern !== undefined &&
      (!taxonomy.archive || routePattern !== options.routePattern)
    )
      continue;
    const archive = resolveTaxonomyArchive(taxonomy, {
      lang: locale,
      taxonomyBasePath: context.taxonomyBasePath,
    });
    const terms = graphs.get(id);
    const sources = await sourcesFor(taxonomy, context, getCollection);
    const authoredTerms = new Map(
      (await getCollection(id)).map((entry) => [entry.id, entry.data]),
    );
    const localized = taxonomy.locales?.[locale];
    const hrefFor = (value, language = locale) => {
      const authored = authoredTerms.get(value.id);
      return getLocaleHref(
        taxonomyTermPath(taxonomy, authored, {
          lang: language,
          taxonomyBasePath: context.taxonomyBasePath,
        }),
        language,
      );
    };
    for (const term of terms.values()) {
      const ancestors = [];
      for (let parent = term.parent; parent; parent = terms.get(parent).parent)
        ancestors.unshift(terms.get(parent));
      const breadcrumbs = [
        ...(homeHref ? [{ label: context.site.brand, href: homeHref }] : []),
        ...ancestors.map((ancestor) => ({
          label: ancestor.name,
          href: hrefFor(ancestor),
        })),
        // Moo Breadcrumb permits plain text only in its current item.
        { label: `${localized?.label ?? taxonomy.label}: ${term.name}` },
      ];
      paths.push({
        routePattern,
        params: {
          ...(archive.taxonomySegment === undefined
            ? {}
            : { taxonomy: archive.taxonomySegment }),
          slug: normalizeSlug(term.slug, { lang: locale }),
        },
        props: {
          taxonomy: id,
          term,
          href: hrefFor(term),
          breadcrumbs,
          ...(context.i18n
            ? {
                locale,
                alternates: context.i18n.locales.map((language) => ({
                  locale: language,
                  href: hrefFor(term, language),
                })),
              }
            : {}),
          items: termItems(taxonomy, terms, term.id, sources, {
            locale: context.i18n ? locale : undefined,
            include: taxonomy.archive ? taxonomy.archive.include : "direct",
            getEntryHref,
          }),
        },
      });
    }
  }
  return paths;
}
