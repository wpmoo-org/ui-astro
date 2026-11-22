import { getSiteContext, getSiteNavigation } from "../context/index.js";
import { getLocaleHref } from "../i18n/index.js";
import { getTaxonomyPaths, getTaxonomyTerms } from "../taxonomies/queries.js";
import { entryTaxonomyGroups, getSiteChrome, groupTaxonomyLinks } from "../site/chrome.js";
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

export function getChrome(input) {
  return getSiteChrome(input, { getSiteContext, getSiteNavigation, getLocaleHref, getTaxonomyPaths });
}
