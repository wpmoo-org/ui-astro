import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "../../../../src/content/index.js";
import { pageSchema } from "../../../../src/plugins/page/content.js";

export const collections = {
  page: defineCollection({
    loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }),
    schema: pageSchema,
  }),
};
