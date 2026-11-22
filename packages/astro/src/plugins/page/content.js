import { z } from "astro/zod";
import { entrySchema } from "../../content/index.js";

export const pageSchema = entrySchema.extend({
  navOrder: z.number().int().nonnegative().optional(),
  navLabel: z.string().trim().min(1).optional(),
});
