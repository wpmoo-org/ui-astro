import { getPublishedPages } from "@wpmoo/astro/plugins/page/queries";
import { getPublishedPosts } from "@wpmoo/astro/plugins/post/queries";
import { getEntryHref } from "@wpmoo/astro/context";
import { getEntryClasses } from "@wpmoo/astro/config";

type Entry =
  | Awaited<ReturnType<typeof getPublishedPages>>[number]
  | Awaited<ReturnType<typeof getPublishedPosts>>[number];

export const GET = async () => {
  const entries = (records: Entry[]) =>
    records
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => ({
        id: entry.id,
        data: entry.data,
        href: getEntryHref(entry.collection, entry),
        classNames: getEntryClasses({
          type: entry.collection,
          id: entry.id,
          source: "markdown",
        }),
      }));
  return Response.json({
    page: entries(await getPublishedPages()),
    post: entries(await getPublishedPosts()),
  });
};
