import type { z } from "astro/zod";
import type { entrySchema } from "@wpmoo/astro/content";

export declare const sampleSchema: z.ZodObject<
  typeof entrySchema.shape & {
    id: z.ZodString;
    body: z.ZodString;
  }
>;

export type Sample = z.infer<typeof sampleSchema>;
