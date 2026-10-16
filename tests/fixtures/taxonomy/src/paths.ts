import { getCollection } from "astro:content";
import { getEntryHref, getSiteContext } from "@wpmoo/astro/context";
import { getLocaleHref, getRouteLocale } from "@wpmoo/astro/i18n";
export async function projectPaths(routePattern: string) {
  const locale = getRouteLocale(routePattern);
  const plugin = getSiteContext().plugins.find(
    (item) => item.id === "projects",
  )!;
  const prefix = getLocaleHref(
    plugin.locales?.[locale]?.basePath ?? plugin.basePath,
    locale,
  ).replace(/\/$/u, "");
  return (await getCollection("project"))
    .filter(
      (entry) =>
        entry.data.status === "publish" && entry.data.locale === locale,
    )
    .map((entry) => ({
      params: {
        slug: getEntryHref("project", entry)
          .slice(prefix.length + 1)
          .replace(/\/$/u, ""),
      },
      props: { entry },
    }));
}
