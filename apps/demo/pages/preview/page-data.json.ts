import type { APIRoute } from "astro";
import {
  getPagePaths,
  getPublishedPages,
} from "@wpmoo/astro/plugins/page/queries";
import { getSiteContext } from "@wpmoo/astro/context";

export const GET: APIRoute = async ({ currentLocale }) => {
  const lang = currentLocale ?? getSiteContext().site.defaults.lang;
  const locale = getSiteContext().i18n ? lang : undefined;
  const published = await getPublishedPages({ locale });
  const paths = await getPagePaths({ lang, locale });
  return new Response(
    JSON.stringify({
      lang,
      publishedIds: published.map((entry) => entry.id),
      paths: paths.map(({ params, props }) => ({
        id: props.entry.id,
        slug: params.slug,
      })),
      contactOptions: published[0]?.data.options,
      contactDate: published[0]?.data.published_at?.toISOString(),
      filePaths: published.map((entry) => entry.filePath),
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
};
