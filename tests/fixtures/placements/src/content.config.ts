import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { contentBlockSchema } from "@wpmoo/astro/placements/content";
export const collections = {
  block: defineCollection({
    loader: glob({
      base: "./src/content/block",
      pattern: "**/*.{md,mdx}",
      retainBody: true,
    }),
    schema: contentBlockSchema,
  }),
};
