import { defineCollection, reference } from "astro:content";
import { file, glob } from "astro/loaders";
import { fileURLToPath } from "node:url";
import { z } from "astro/zod";
import { entrySchema, sourceEntryId } from "@wpmoo/astro/content";
import { termSchema } from "@wpmoo/astro/taxonomies/content";
import { taxonomies } from "./definitions.mjs";
export const collections = {
  project: defineCollection({
    loader: glob({
      base: new URL("./content/project/", import.meta.url),
      pattern: "**/*.md",
      generateId: sourceEntryId,
    }),
    schema: entrySchema.extend({
      taxonomies: z
        .object({
          category: z.array(reference("category")).default([]),
          tag: z.array(reference("tag")).default([]),
        })
        .strict()
        .optional(),
    }),
  }),
  ...Object.fromEntries(
    taxonomies.map((taxonomy) => [
      taxonomy.id,
      defineCollection({
        loader: file(fileURLToPath(new URL(taxonomy.source))),
        schema: termSchema,
      }),
    ]),
  ),
};
