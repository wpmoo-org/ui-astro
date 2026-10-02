import type { z } from "astro/zod";

export interface Term {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly parent?: string;
}

export declare const termSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  slug: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  parent: z.ZodOptional<z.ZodString>;
}>;
