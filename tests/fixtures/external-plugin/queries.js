import { getCollection } from "astro:content";
import { getEntryHref, getSiteContext } from "@wpmoo/astro/context";

export async function getPublishedSamples() {
  return (await getCollection("sample"))
    .filter((entry) => entry.data.status === "publish")
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
}

export async function getSamplePaths() {
  const context = getSiteContext();
  const plugin = context.plugins.find((item) => item.id === "sample");
  if (!plugin)
    throw new TypeError("Sample paths require the active sample plugin");
  const prefix = `${context.base === "/" ? "" : context.base.replace(/\/$/u, "")}${plugin.basePath}/`;
  return (await getPublishedSamples()).map((entry) => {
    const href = getEntryHref("sample", entry);
    if (!href.startsWith(prefix))
      throw new TypeError(
        `Sample href ${href} is outside its declared namespace`,
      );
    return {
      params: { slug: href.slice(prefix.length).replace(/\/$/u, "") },
      props: { entry },
    };
  });
}

export function sampleLoopItems(entries) {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.data.title,
    href: getEntryHref("sample", entry),
    ...(entry.data.description === undefined
      ? {}
      : { description: entry.data.description }),
    ...(entry.data.published_at === undefined
      ? {}
      : { date: entry.data.published_at }),
    entryContext: {
      type: "sample",
      id: entry.id,
      source: "json",
      ...(entry.data.taxonomies === undefined
        ? {}
        : {
            taxonomies: Object.fromEntries(
              Object.entries(entry.data.taxonomies).map(([taxonomy, refs]) => [
                taxonomy,
                refs.map((ref) => ref.id),
              ]),
            ),
          }),
    },
  }));
}
