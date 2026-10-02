import { defineCollection } from "astro:content";
import { file } from "astro/loaders";
import { sampleSchema } from "@wpmoo-test/astro-content/content";

export const collections = {
  sample: defineCollection({
    loader: file("src/data/sample.json"),
    schema: sampleSchema,
  }),
};
