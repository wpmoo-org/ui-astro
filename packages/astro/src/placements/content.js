import { z } from "astro/zod";
import { validLocale } from "../i18n/profile.js";

export const contentBlockSchema = z.strictObject({
  translationKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  locale: z.string().refine(validLocale, "must be a valid locale").optional(),
  title: z.string().trim().min(1).optional(),
  status: z.enum(["draft", "publish"]).default("draft"),
});

export function validateContentBlocks(
  entries,
  i18n = false,
  defaultLocale = "en",
) {
  const identities = new Set();
  for (const entry of entries) {
    const result = contentBlockSchema.safeParse(entry.data);
    if (!result.success)
      throw new TypeError(`Content block ${entry.id}: ${result.error.message}`);
    const data = result.data;
    if (i18n && !data.locale)
      throw new TypeError(
        `Content block ${entry.id} requires locale with i18n`,
      );
    const identity = `${data.locale ?? defaultLocale}\0${data.translationKey}`;
    if (identities.has(identity))
      throw new TypeError(
        `Duplicate content block ${identity.replace("\0", "/")}`,
      );
    identities.add(identity);
  }
}

export function selectContentBlock(entries, key, locale, i18n = false) {
  validateContentBlocks(entries, i18n, locale);
  if (!entries.some((entry) => entry.data.translationKey === key))
    throw new TypeError(`Missing content block translationKey ${key}`);
  return entries.find(
    (entry) =>
      entry.data.translationKey === key &&
      (entry.data.locale ?? locale) === locale &&
      entry.data.status === "publish",
  );
}
