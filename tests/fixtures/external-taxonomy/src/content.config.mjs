import { defineCollection, reference } from "astro:content";
import { glob, file } from "astro/loaders";
import { fileURLToPath } from "node:url";
import { z } from "astro/zod";
import { sourceEntryId, jsonEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
import { postSchema } from "@wpmoo/astro/plugins/post/content";
import { termSchema } from "@wpmoo/astro/taxonomies/content";
import { taxonomies } from "./definitions.mjs";
import { sampleSchema } from "@wpmoo-test/astro-content/content";
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
      pattern: "**/*.md",
      generateId: sourceEntryId,
    }),
    schema: pageSchema.extend(relationships),
  }),
  post: defineCollection({
    loader: glob({
      base: new URL("./content/post/", import.meta.url),
      pattern: "**/*.md",
      generateId: sourceEntryId,
    }),
    schema: postSchema.extend(relationships),
  }),
  sample: defineCollection({
    loader: file("src/data/sample.json"),
    schema: sampleSchema.extend(relationships),
  }),
  ...Object.fromEntries(
    taxonomies.map((taxonomy) => [
      taxonomy.id,
      defineCollection({
        schema: termSchema,
        loader:
          taxonomy.sourceKind === "json-directory"
            ? glob({
                base: new URL(taxonomy.source),
                pattern: "*.json",
                generateId: jsonEntryId,
              })
            : file(fileURLToPath(new URL(taxonomy.source))),
      }),
    ]),
  ),
};
