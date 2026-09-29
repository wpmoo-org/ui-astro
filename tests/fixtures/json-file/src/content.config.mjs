import { defineCollection, z } from "astro:content";
import { file } from "astro/loaders";

export const collections = {
  team: defineCollection({
    loader: file("src/content/team.json"),
    schema: z.strictObject({ id: z.string(), title: z.string(), status: z.enum(["publish", "draft"]) }),
  }),
};
