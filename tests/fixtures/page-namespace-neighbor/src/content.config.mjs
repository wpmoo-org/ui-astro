import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId, jsonEntryId } from "../../../../src/content/index.js";
import { pageSchema } from "../../../../src/plugins/page/content.js";

export const collections = {
  page: defineCollection({
    loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }),
    schema: pageSchema,
  }),
  sample: defineCollection({
    loader: glob({ base: new URL("./content/sample/", import.meta.url), pattern: "*.json", generateId: jsonEntryId }),
    schema: z.strictObject({ id: z.string(), title: z.string(), status: z.enum(["publish", "draft"]) }),
  }),
};
