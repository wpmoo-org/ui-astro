import type { z } from "astro/zod";
import type { entrySchema } from "../../content/index.js";

export declare const postSchema: z.ZodObject<typeof entrySchema.shape>;
export type Post = z.infer<typeof postSchema>;
