import type { z } from "astro/zod";
export declare const contentBlockSchema: z.ZodObject<{
  translationKey: z.ZodString;
  locale: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
  status: z.ZodDefault<z.ZodEnum<{ draft: "draft"; publish: "publish" }>>;
}>;
