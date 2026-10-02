import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { sourceEntryId, jsonEntryId, entrySchema } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
import { termSchema } from "@wpmoo/astro/taxonomies/content";
import { sectionsSchema } from "./sections";

const authoredFields = {
  sections: sectionsSchema.optional(),
  taxonomies: z
    .object({
      category: z.array(reference("category")).default([]),
      tag: z.array(reference("tag")).default([]),
    })
    .strict()
    .optional(),
};
export const collections = {
  page: defineCollection({
    loader: glob({
      base: new URL("./content/page/", import.meta.url),
      pattern: "**/*.md",
      generateId: sourceEntryId,
    }),
    schema: pageSchema.extend(authoredFields),
  }),
  sample: defineCollection({
    loader: glob({
      base: new URL("./data/sample/", import.meta.url),
      pattern: "*.json",
      generateId: jsonEntryId,
    }),
    schema: entrySchema.extend({
      id: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
      body: z.string(),
      ...authoredFields,
    }),
  }),
  category: defineCollection({
    loader: glob({
      base: new URL("./data/category/", import.meta.url),
      pattern: "*.json",
      generateId: jsonEntryId,
    }),
    schema: termSchema,
  }),
  tag: defineCollection({
    loader: glob({
      base: new URL("./data/tag/", import.meta.url),
      pattern: "*.json",
      generateId: jsonEntryId,
    }),
    schema: termSchema,
  }),
};
