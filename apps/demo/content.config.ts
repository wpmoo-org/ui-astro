import { defineCollection, reference } from "astro:content";
import { glob, file } from "astro/loaders";
import { z } from "astro/zod";
import { sourceEntryId, jsonEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
import { postSchema } from "@wpmoo/astro/plugins/post/content";
import { termSchema } from "@wpmoo/astro/taxonomies/content";
import { taxonomies, termFilePaths } from "./definitions.js";
import { sectionsSchema } from "./sections";

const relationships = {
  taxonomies: z
    .object({
      category: z.array(reference("category")).default([]),
      tag: z.array(reference("tag")).default([]),
      sector: z.array(reference("sector")).default([]),
    })
    .strict()
    .optional(),
};

export const collections = {
  page: defineCollection({
    loader: glob({
      base: new URL("./content/page/", import.meta.url),
      pattern: "**/*.{md,mdx}",
      generateId: sourceEntryId,
    }),
    schema: pageSchema.extend({
      ...relationships,
      sections: sectionsSchema.optional(),
    }),
  }),
  post: defineCollection({
    loader: glob({
      base: new URL("./content/post/", import.meta.url),
      pattern: "**/*.{md,mdx}",
      generateId: sourceEntryId,
    }),
    schema: postSchema.extend(relationships),
  }),
  category: defineCollection({
    loader: file(termFilePaths.category),
    schema: termSchema,
  }),
  tag: defineCollection({
    loader: file(termFilePaths.tag),
    schema: termSchema,
  }),
  sector: defineCollection({
    loader: glob({
      base: new URL(taxonomies[2].source),
      pattern: "*.json",
      generateId: jsonEntryId,
    }),
    schema: termSchema,
  }),
};
