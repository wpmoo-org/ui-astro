import { getEntryHref, getSiteContext, getSiteNavigation, validateSiteContent } from "../context/index.js";
import { normalizeSlug } from "../config/index.js";
import { siteHref } from "../content/paths.js";
import { termHref, termItems, validateTerms } from "./paths.js";

function activeTaxonomy(context, id) {
  const taxonomy = context.taxonomies.find(item => item.id === id);
  if (!taxonomy) throw new TypeError(`Taxonomy ${String(id)} is unknown or inactive`);
  return taxonomy;
}

async function inputs() {
  await validateSiteContent();
  const { getCollection } = await import("astro:content");
  const context = getSiteContext();
  const graphs = new Map();
  for (const taxonomy of context.taxonomies) {
    graphs.set(taxonomy.id, validateTerms(taxonomy, await getCollection(taxonomy.id), { lang: context.site.defaults.lang }));
  }
  return { context, graphs, getCollection };
}

async function sourcesFor(taxonomy, context, getCollection) {
  const sources = [];
  for (const type of context.plugins.flatMap(plugin => plugin.contentTypes)) {
    if (type.taxonomies.includes(taxonomy.id)) sources.push({ type, entries: await getCollection(type.collection) });
  }
  return sources;
}

export async function getTaxonomyTerms(taxonomyId) {
  const { context, graphs } = await inputs();
  activeTaxonomy(context, taxonomyId);
  return Object.freeze([...graphs.get(taxonomyId).values()]);
}

export async function getTermEntries(taxonomyId, termId, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => key !== "include")) throw new TypeError("Term query options support only include");
  const { context, graphs, getCollection } = await inputs();
  const taxonomy = activeTaxonomy(context, taxonomyId);
  return termItems(taxonomy, graphs.get(taxonomyId), termId, await sourcesFor(taxonomy, context, getCollection), { ...options, getEntryHref });
}

export async function getTaxonomyPaths(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => key !== "taxonomies")) throw new TypeError("Taxonomy path options support only taxonomies");
  const { context, graphs, getCollection } = await inputs();
  const selected = options.taxonomies ?? context.taxonomies.filter(taxonomy => taxonomy.archive).map(taxonomy => taxonomy.id);
  if (!Array.isArray(selected) || new Set(selected).size !== selected.length) throw new TypeError("Taxonomy path selection must contain unique active IDs");
  const navigation = await getSiteNavigation(siteHref("/", context));
  const homeHref = navigation.find(item => item.href === siteHref("/", context))?.href ?? navigation[0]?.href;
  const paths = [];
  for (const id of selected) {
    const taxonomy = activeTaxonomy(context, id);
    const terms = graphs.get(id);
    const sources = await sourcesFor(taxonomy, context, getCollection);
    const hrefOptions = { ...context, lang: context.site.defaults.lang };
    for (const term of terms.values()) {
      const ancestors = [];
      for (let parent = term.parent; parent; parent = terms.get(parent).parent) ancestors.unshift(terms.get(parent));
      const breadcrumbs = [
        ...(homeHref ? [{ label: context.site.brand, href: homeHref }] : []),
        ...ancestors.map(ancestor => ({ label: ancestor.name, href: termHref(taxonomy, ancestor, hrefOptions) })),
        // Moo Breadcrumb permits plain text only in its current item.
        { label: `${taxonomy.label}: ${term.name}` },
      ];
      paths.push({ params: { taxonomy: id, slug: normalizeSlug(term.slug, { lang: context.site.defaults.lang }) }, props: {
        taxonomy: id, term, href: termHref(taxonomy, term, hrefOptions), breadcrumbs,
        items: termItems(taxonomy, terms, term.id, sources, { include: taxonomy.archive ? taxonomy.archive.include : "direct", getEntryHref }),
      } });
    }
  }
  return paths;
}
