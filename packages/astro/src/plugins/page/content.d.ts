import type { z } from "astro/zod";
import type { entrySchema } from "../../content/index.js";

export declare const pageSchema: z.ZodObject<typeof entrySchema.shape & {
  navOrder: z.ZodOptional<z.ZodNumber>;
  navLabel: z.ZodOptional<z.ZodString>;
}>;

export type Page = z.infer<typeof pageSchema>;
