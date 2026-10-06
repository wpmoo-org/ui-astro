import { getSiteContext } from "../context/index.js";
import { getTaxonomyPaths, getTaxonomyTerms } from "../taxonomies/queries.js";
import { entryTaxonomyGroups, groupTaxonomyLinks } from "../site/chrome.js";
export { getTaxonomyTerms as getKnownTerms };
export async function getAssignedTerms(entry, type, locale) {
  const site = getSiteContext();
  return entryTaxonomyGroups(
    { type, id: entry.id, source: "markdown", taxonomies: entry.taxonomies },
    groupTaxonomyLinks(
      site.taxonomies,
      await getTaxonomyPaths({ locale: site.i18n ? locale : undefined }),
      locale,
    ),
  );
}

export { getSiteChrome as getChrome } from "../site/chrome.js";
