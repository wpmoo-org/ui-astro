import type { APIRoute } from "astro";
import { getPagePaths, getPublishedPages } from "@wpmoo/astro/plugins/page/queries";

export const GET: APIRoute = async () => {
  const published = await getPublishedPages();
  const paths = await getPagePaths({ lang: "tr" });
  return new Response(JSON.stringify({
    publishedIds: published.map((entry) => entry.id),
    paths: paths.map(({ params, props }) => ({ id: props.entry.id, slug: params.slug })),
    contactLayout: published[0]?.data.layout,
    contactDate: published[0]?.data.published_at?.toISOString(),
    filePaths: published.map((entry) => entry.filePath),
  }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
