import type { z } from "astro/zod";
import type { PageOptionsInput } from "../config/index.js";

export type PublicationStatus = "publish" | "draft" | "pending" | "future";

export declare const entrySchema: z.ZodObject<{
  title: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  slug: z.ZodOptional<z.ZodString>;
  status: z.ZodType<PublicationStatus>;
  created_at: z.ZodOptional<z.ZodType<Date>>;
  published_at: z.ZodOptional<z.ZodType<Date>>;
  updated_at: z.ZodOptional<z.ZodType<Date>>;
  layout: z.ZodOptional<z.ZodType<PageOptionsInput>>;
}>;

export type Entry = z.infer<typeof entrySchema>;

export declare function sourceEntryId(input: { entry: string; data?: Record<string, unknown> }): string;
export declare function jsonEntryId(input: { entry: string; data: Record<string, unknown> }): string;
