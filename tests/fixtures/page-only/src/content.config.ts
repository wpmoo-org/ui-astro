import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";

export const collections = {
  page: defineCollection({
    loader: glob({
      base: new URL("./content/page/", import.meta.url),
      pattern: "**/*.md",
      generateId: sourceEntryId,
    }),
    schema: pageSchema,
  }),
};
