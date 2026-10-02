import type { APIRoute } from "astro";
import { getCollection, type CollectionKey } from "astro:content";
import { getEntryHref, getSiteContext } from "@wpmoo/astro/context";
import { getEntryClasses, normalizeSlug } from "@wpmoo/astro/config";
import { entrySchema } from "@wpmoo/astro/content";
import { z } from "astro/zod";

const hrefSchema = z.object({
  status: entrySchema.shape.status,
  slug: entrySchema.shape.slug,
  locale: entrySchema.shape.locale,
  translationKey: entrySchema.shape.translationKey,
});

// Private certification output, never a shipped route or an editor preview.
export const GET: APIRoute = async () => {
  const context = getSiteContext();
  const types = [];
  for (const type of context.plugins.flatMap((plugin) => plugin.contentTypes)) {
    const entries = await getCollection(type.collection as CollectionKey);
    types.push({
      id: type.id,
      collection: type.collection,
      sourceKind: type.sourceKind,
      entries: entries
        .map((entry) => {
          const data = entry.data;
          const hrefData = hrefSchema.parse(data);
          return {
            id: entry.id,
            filePath: entry.filePath,
            data,
            body: entry.body,
            href:
              hrefData.status === "publish"
                ? getEntryHref(type.id, {
                    collection: entry.collection,
                    id: entry.id,
                    data: hrefData,
                  })
                : null,
            classes: getEntryClasses({
              type: type.id,
              id: entry.id,
              source: type.sourceKind === "markdown" ? "markdown" : "json",
            }),
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
    });
  }
  const taxonomies = [];
  for (const taxonomy of context.taxonomies) {
    const terms = await getCollection(taxonomy.id as CollectionKey);
    taxonomies.push({
      id: taxonomy.id,
      entries: terms.map((term) => ({
        id: term.id,
        filePath: term.filePath,
        data: term.data,
      })),
    });
  }
  const characterCases = [
    ["İletişim", "tr"],
    ["Über", "en"],
    ["Über", "de"],
    ["Straße", "de"],
    ["Ä Ö Ü ä ö ü ß", "de"],
    ["a\u0308", "de"],
    ["Nested/Foo Bar", "en"],
  ].map(([input, lang]) => ({
    input,
    lang,
    slug: normalizeSlug(input, { lang }),
  }));
  return Response.json({ context, types, taxonomies, characterCases });
};
