// Project inputs; the selected main locale has no public URL prefix.
export const mainLanguage = process.env.PILOT_MAIN_LANGUAGE ?? "en";
export const categoryProfile = process.env.PILOT_CATEGORY_PROFILE ?? "category";
if (!["en", "de"].includes(mainLanguage))
  throw new TypeError("Invalid pilot main language");
const prefixes = {
  category: { en: "/category", de: "/kategorie" },
  short: { en: "/c", de: "/k" },
  root: { en: "/", de: "/" },
};
if (!Object.hasOwn(prefixes, categoryProfile))
  throw new TypeError("Invalid pilot category profile");
export const categoryPrefixes = prefixes[categoryProfile];
export const srcDir = new URL(`../routes/${mainLanguage}/`, import.meta.url);
