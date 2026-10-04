import { z } from "astro/zod";
import { normalizeSlug } from "../config/index.js";
import { validLocale } from "../i18n/profile.js";

const id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "must be a lowercase kebab ID");
const slug = z
  .string()
  .min(1)
  .refine((value) => {
    if (/[\/\\%?#\x00-\x1f\x7f]/u.test(value)) return false;
    try {
      normalizeSlug(value);
      return true;
    } catch {
      return false;
    }
  }, "must be one safe normalizable URL segment");

export const termSchema = z.strictObject({
  id,
  name: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => !/[\x00-\x1f\x7f]/u.test(value),
      "must be nonempty plain text",
    ),
  slug,
  description: z.string().optional(),
  parent: id.optional(),
  locales: z
    .record(
      z.string().refine(validLocale, "must be a valid locale"),
      z.strictObject({
        name: z
          .string()
          .trim()
          .min(1)
          .refine(
            (value) => !/[\x00-\x1f\x7f]/u.test(value),
            "must be plain text",
          )
          .optional(),
        slug: slug.optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});
