import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { normalizeSlug } from "@wpmoo/astro/config";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";

if (normalizeSlug("İletişim", { lang: "tr" }) !== "iletisim") {
  throw new Error("The public config import did not normalize the content slug");
}

export const collections = {
  page: defineCollection({
    loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }),
    schema: pageSchema,
  }),
};
