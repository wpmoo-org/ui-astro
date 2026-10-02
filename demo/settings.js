import { getSiteContext } from "@wpmoo/astro/context";
import { resolvePageOptions } from "@wpmoo/astro/config";
import { getPagePaths } from "@wpmoo/astro/plugins/page/queries";
import { getRouteLocale } from "@wpmoo/astro/i18n";

// These accepted Archive fixtures keep the same authored records as the demo grows.
export const demoPageArchiveEntryIds = Object.freeze([
  "contact.md",
  "guide/setup.md",
]);

// These authored example choices belong to the host, outside the npm package.
export const demoControls = Object.freeze({
  action: Object.freeze({ variant: "ghost", size: "sm", class: "ms-auto" }),
  sidebarFooterUtilities: Object.freeze(["small", "text-body-secondary"]),
});

export function getDemoOptions(type = "page", view = "single", overrides = {}) {
  return resolvePageOptions(getSiteContext().site, type, view, overrides);
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
