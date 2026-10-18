import type { z } from "astro/zod";
import type { entrySchema, imageSchema } from "../../content/index.js";

export declare const postSchema: z.ZodObject<typeof entrySchema.shape & {
  cover: z.ZodOptional<typeof imageSchema>;
}>;
export type Post = z.infer<typeof postSchema>;
