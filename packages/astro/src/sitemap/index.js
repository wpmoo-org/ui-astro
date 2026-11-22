import profile, { loadContent } from "virtual:wpmoo-astro/sitemap";
import { siteHref } from "../content/paths.js";
import { resolveSitemapOptions, sitemapPageForms } from "./options.js";
import { groupSitemapPages, sitemapTokens, splitLocale } from "../integration/sitemap-page.js";

/** The template tokens of this build (random per build). */
export function getSitemapTokens() {
  return sitemapTokens(profile.nonce);
}

/** Whether the page renders on the dev server, which has no build:done fill. */
export function isDevelopmentServer() {
  return profile.development === true;
}

/**
 * Whether a rendered path is a locale's HTML sitemap page (href from
 * getSitemapOptions) in a form the build format gives it, while the page is
 * on; only there does the build fill the template.
 */
export function isSitemapPage(pathname, href) {
  return (
    profile.htmlSitemap === true &&
    sitemapPageForms(href, { format: profile.buildFormat, development: profile.development }).includes(String(pathname))
  );
}

/** Copy, page href, preferences and locale links of the HTML sitemap page. */
export function getSitemapOptions(locale) {
  return resolveSitemapOptions(profile, locale);
}

/**
 * Development only: the pre-build list grouped like the build fills it,
 * from published SDK content entries and literal host routes. The build
 * lists every built page instead.
 */
export async function getDevelopmentGroups(locale, copy) {
  const pages = new Map();
  const add = (href, title, description) => {
    const mount = profile.base === "/" ? "" : profile.base.replace(/\/$/u, "");
    const path = mount && href.startsWith(mount) ? href.slice(mount.length) || "/" : href;
    const split = splitLocale(path, profile.i18n, profile.site.defaults.lang);
    if (split.locale !== locale || pages.has(href)) return;
    pages.set(href, { href, segments: split.segments, title: title || path, description: description ?? "" });
  };
  for (const path of profile.staticPaths) {
    try {
      add(siteHref(path, profile), path === "/" ? profile.site.brand : path, "");
    } catch {
      // A noncanonical host path is not a page the SDK can address.
    }
  }
  if (loadContent) {
    const [{ getCollection }, { getEntryHref, getSiteContext }] = await loadContent();
    for (const plugin of getSiteContext().plugins)
      for (const type of plugin.contentTypes) {
        let entries = [];
        try {
          entries = await getCollection(type.collection);
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (entry.data?.status !== "publish" || entry.data?.seo?.noindex === true) continue;
          try {
            add(getEntryHref(type.id, entry), entry.data.title, entry.data.description);
          } catch {
            // An entry the SDK cannot address has no page to list.
          }
        }
      }
  }
  return groupSitemapPages([...pages.values()], { topLabel: copy.topLabel, locale });
}
