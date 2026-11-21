import { z } from "astro/zod";
import { entrySchema } from "../../content/index.js";

export const pageSchema = entrySchema.extend({
  navOrder: z.number().int().nonnegative().optional(),
  navPlacement: z.enum(["main", "utility", "drawer"]).optional(),
  navLabel: z.string().trim().min(1).optional(),
});
