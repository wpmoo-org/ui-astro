import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { jsonEntryId } from "../../../../packages/astro/src/content/index.js";

export const collections = {
  team: defineCollection({
    loader: glob({ base: new URL("./content/team/", import.meta.url), pattern: "*.json", generateId: jsonEntryId }),
    schema: z.strictObject({ id: z.string(), title: z.string(), status: z.enum(["publish", "draft"]) }),
  }),
};
