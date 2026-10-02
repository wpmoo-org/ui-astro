import { z } from "astro/zod";
import { entrySchema } from "@wpmoo/astro/content";

export const sampleSchema = entrySchema.extend({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  body: z.string(),
});
