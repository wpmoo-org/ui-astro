import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { postSchema } from "@wpmoo/astro/plugins/post/content";

export const collections = {
  post: defineCollection({
    loader: glob({
      base: new URL("./content/post/", import.meta.url),
      pattern: "**/*.md",
      generateId: sourceEntryId,
    }),
    schema: postSchema,
  }),
};
