import { resolveSitePresentation } from "../site/presentation.js";
import { siteHref } from "../internal/site-href.js";
import { localePath } from "../i18n/profile.js";
export function emptySiteChrome(profile, { href, locale, title }) {
  const homeHref = siteHref(localePath("/", locale, profile.i18n), profile);
  return {
    locale,
    brand: profile.site.brand,
    homeHref,
    languageLinks: [],
    presentation: resolveSitePresentation(profile.site, locale),
    taxonomyGroups: [],
    navigation: [],
    breadcrumbs:
      href === homeHref
        ? [{ label: title }]
        : [{ label: profile.site.brand, href: homeHref }, { label: title }],
  };
}
