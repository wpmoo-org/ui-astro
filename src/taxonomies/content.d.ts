import type { z } from "astro/zod";

export interface Term {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly parent?: string;
  readonly locales?: Readonly<
    Record<
      string,
      Readonly<Partial<Pick<Term, "name" | "description" | "slug">>>
    >
  >;
}

export declare const termSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  slug: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  parent: z.ZodOptional<z.ZodString>;
  locales: z.ZodOptional<z.ZodType<NonNullable<Term["locales"]>>>;
}>;
