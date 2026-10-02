import { getDemoMessages } from "./messages.js";
import {
  getEntryHref,
  getSiteContext,
  getSiteNavigation,
} from "@wpmoo/astro/context";
import { getLocaleHref } from "@wpmoo/astro/i18n";
import { getPublishedPosts } from "@wpmoo/astro/plugins/post/queries";
import { getTaxonomyPaths } from "@wpmoo/astro/taxonomies/queries";

// The example host owns these routes; they are excluded from the npm package.
export async function getDemoNavigation(currentPath, locale) {
  const { site, i18n, plugins, taxonomies } = getSiteContext();
  const copy = getDemoMessages(locale);
  const path = currentPath.replace(/\/$/, "") || "/";
  const item = (title, href, icon) => ({
    title,
    href,
    icon,
    active: path === (href.replace(/\/$/, "") || "/"),
  });
  const navigation = await getSiteNavigation(currentPath, locale);
  const post = plugins.find((plugin) => plugin.id === "post");
  const postHref = post
    ? getLocaleHref(post.locales?.[locale]?.basePath ?? post.basePath, locale)
    : undefined;
  const siteItems = navigation
    .filter((link) => link.href !== postHref)
    .map((link) =>
      item(
        link.label === "Contact" ? copy.contact : link.label,
        link.href,
        "file-text",
      ),
    );
  const defaultLocale = i18n?.defaultLocale ?? site.defaults.lang;
  const fixtures = locale === defaultLocale;
  const homeHref = fixtures
    ? getLocaleHref("/", locale)
    : (siteItems[0]?.href ?? postHref ?? currentPath);
  const homeLabel = fixtures
    ? copy.overview
    : (navigation.find((link) => link.href === homeHref)?.label ?? site.brand);
  if (fixtures && !siteItems.some((link) => link.href === homeHref))
    siteItems.unshift(item(copy.overview, homeHref, "panel-left"));

  const examples = fixtures
    ? [
        item(
          copy.single,
          getLocaleHref("/preview/single", locale),
          "file-text",
        ),
        item(
          copy.archive,
          getLocaleHref("/preview/archive", locale),
          "layout-grid",
        ),
        item(
          copy.pageArchive,
          getLocaleHref("/preview/page-archive", locale),
          "layout-grid",
        ),
        item(
          copy.customArchive,
          getLocaleHref("/preview/page-archive-slots", locale),
          "layout-grid",
        ),
      ]
    : [];
  if (post) {
    examples.push(item(copy.postArchive, postHref, "layout-grid"));
    const entries = await getPublishedPosts({
      locale: i18n ? locale : undefined,
    });
    for (const entry of [...entries].reverse()) {
      examples.push(
        item(entry.data.title, getEntryHref("post", entry), "file-text"),
      );
    }
  }
  if (taxonomies.some((taxonomy) => taxonomy.archive)) {
    const paths = await getTaxonomyPaths({ locale });
    for (const [taxonomy, id, title] of [
      ["category", "guides", copy.categoryArchive],
      ["category", "layouts", copy.childCategoryArchive],
      ["tag", "astro", copy.tagArchive],
      ["tag", "empty", copy.emptyTagArchive],
      ["sector", "foundation", copy.customTaxonomyArchive],
    ]) {
      const route = paths.find(
        (value) =>
          value.props.taxonomy === taxonomy && value.props.term.id === id,
      );
      if (route) examples.push(item(title, route.props.href, "layout-grid"));
    }
  }
  if (fixtures)
    examples.push(
      item("Native Astro page", getLocaleHref("/landing", locale), "file-text"),
      item(
        copy.emptyStateTitle,
        getLocaleHref("/preview/i18n-empty", locale),
        "layout-grid",
      ),
      ...Object.entries(copy.layoutProfiles).map(([id, title]) =>
        item(
          title,
          getLocaleHref(`/preview/layouts/${id}`, locale),
          "panel-left",
        ),
      ),
    );
  return {
    homeHref,
    homeLabel,
    groups: [
      { label: copy.site, items: siteItems },
      { label: copy.examples, items: examples },
    ],
  };
}
