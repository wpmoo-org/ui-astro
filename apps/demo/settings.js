import { getSiteContext } from "@wpmoo/astro/context";
import { resolvePageOptions } from "@wpmoo/astro/config";
import { getPagePaths } from "@wpmoo/astro/plugins/page/queries";
import { getPostPaths } from "@wpmoo/astro/plugins/post/queries";
import { getTaxonomyPaths } from "@wpmoo/astro/taxonomies/queries";
import { getRouteLocale } from "@wpmoo/astro/i18n";

// These accepted Archive fixtures keep the same authored records as the demo grows.
export const demoPageArchiveTranslationKeys = Object.freeze([
  "contact",
  "setup-guide",
]);

// These authored example choices belong to the host, outside the npm package.
export const demoControls = Object.freeze({
  sidebar: Object.freeze({ id: "demo-sidebar", key: "astro-demo" }),
  action: Object.freeze({ variant: "ghost", size: "sm", class: "ms-auto" }),
  sidebarFooterUtilities: Object.freeze(["small", "text-body-secondary"]),
});

export function getDemoOptions(
  type = "page",
  view = "single",
  overrides = {},
  locale,
) {
  return resolvePageOptions(
    getSiteContext().site,
    type,
    view,
    overrides,
    locale,
  );
}

export function getDemoPagePaths(routePattern) {
  const { site, plugins, taxonomies, taxonomyBasePath, i18n } =
    getSiteContext();
  const locale = i18n ? getRouteLocale(routePattern) : undefined;
  return getPagePaths({
    locale,
    lang: locale ?? site.defaults.lang,
    reservedPrefixes: [
      ...plugins
        .filter((plugin) => plugin.id !== "page")
        .map((plugin) => plugin.locales?.[locale]?.basePath ?? plugin.basePath),
      ...(taxonomies.some((taxonomy) => taxonomy.archive)
        ? [taxonomyBasePath]
        : []),
      ...(i18n?.locales.map((value) => `/${value}`) ?? []),
    ],
  });
}

export function getDemoPostPaths(routePattern) {
  const { site, plugins, i18n } = getSiteContext();
  const locale = i18n ? getRouteLocale(routePattern) : undefined;
  const post = plugins.find((plugin) => plugin.id === "post");
  if (!post)
    throw new TypeError("The demo Post routes require the post plugin");
  return getPostPaths({
    locale,
    lang: locale ?? site.defaults.lang,
    basePath: post.locales?.[locale ?? ""]?.basePath ?? post.basePath,
  });
}

export function getDemoTaxonomyPaths(routePattern) {
  const { i18n } = getSiteContext();
  return getTaxonomyPaths({
    locale: i18n ? getRouteLocale(routePattern) : undefined,
  });
}

/** @returns {import("@wpmoo/astro/config").EntryClassContext} */
export function getDemoEntryContext(type, entry) {
  return {
    type,
    id: entry.id,
    source: "markdown",
    ...(entry.data.taxonomies
      ? {
          taxonomies: Object.fromEntries(
            Object.entries(entry.data.taxonomies).map(([id, refs]) => [
              id,
              refs.map((ref) => ref.id),
            ]),
          ),
        }
      : {}),
  };
}
