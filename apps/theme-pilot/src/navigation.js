import { getSiteContext, getSiteNavigation } from "@wpmoo/astro/context";
import { getLocaleHref } from "@wpmoo/astro/i18n";
import { getTaxonomyPaths } from "@wpmoo/astro/taxonomies/queries";
import { getMessages } from "./messages.js";

/** @param {string} currentPath @param {string} locale @param {string} title @param {readonly import("@wpmoo/astro/i18n").LanguageLink[]} languageLinks @returns {Promise<import("@wpmoo/astro-theme-pilot/types").ThemeChrome>} */
export async function getChrome(currentPath, locale, title, languageLinks) {
  const { site, plugins } = getSiteContext();
  const copy = getMessages(locale);
  const links = await getSiteNavigation(currentPath, locale);
  const taxonomyPaths = await getTaxonomyPaths({ locale });
  const post = plugins.find((plugin) => plugin.id === "post");
  const archiveHref = getLocaleHref(
    post.locales?.[locale]?.basePath ?? post.basePath,
    locale,
  );
  const active = (href) =>
    (href.replace(/\/$/, "") || "/") ===
    (currentPath.replace(/\/$/, "") || "/");
  const pages = links
    .filter((link) => link.href !== archiveHref)
    .map((link) => ({
      title: link.label,
      href: link.href,
      active: active(link.href),
    }));
  pages.push({
    title: copy.native,
    href: getLocaleHref("/native-action", locale),
    active: active(getLocaleHref("/native-action", locale)),
  });
  return {
    brand: site.brand,
    homeHref: getLocaleHref("/", locale),
    languageLinks,
    breadcrumbs: [
      { label: site.brand, href: getLocaleHref("/", locale) },
      { label: title },
    ],
    navigation: [
      {
        items: [
          {
            title: copy.pages,
            icon: "file-text",
            open: pages.some((item) => item.active),
            children: pages,
          },
          {
            title: copy.posts,
            href: archiveHref,
            icon: "file-text",
            active: active(archiveHref),
          },
          {
            title: copy.topics,
            icon: "layout-grid",
            open: taxonomyPaths.some((path) => active(path.props.href)),
            children: taxonomyPaths.map((path) => ({
              title: path.props.term.name,
              href: path.props.href,
              active: active(path.props.href),
            })),
          },
        ],
      },
    ],
  };
}
