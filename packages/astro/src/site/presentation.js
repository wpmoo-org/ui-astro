import { z } from "astro/zod";
import { siteHref } from "../internal/site-href.js";

const text = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/[\x00-\x1f\x7f]/u.test(value), "must be plain text");
const locale = z.string().refine((value) => {
  try {
    return (
      /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/u.test(value) &&
      Intl.getCanonicalLocales(value).length === 1
    );
  } catch {
    return false;
  }
}, "must be a valid locale");
const labelsSchema = z.strictObject({
  site: text.optional(),
  pages: text.optional(),
  taxonomies: text.optional(),
  language: text.optional(),
  selectLanguage: text.optional(),
  lightMode: text.optional(),
  darkMode: text.optional(),
  closeNavigation: text.optional(),
  onThisPage: text.optional(),
  overview: text.optional(),
  aside: text.optional(),
});
const copySchema = z.strictObject({
  brandDescription: text.optional(),
  labels: labelsSchema.optional(),
});
const switcherSchema = z.strictObject({
  labelVisibility: z.enum(["responsive", "visible", "hidden"]).optional(),
  variant: z
    .enum([
      "default",
      "secondary",
      "outline",
      "ghost",
      "destructive",
      "link",
      "success",
      "warning",
      "info",
      "light",
      "dark",
      "outline-primary",
      "outline-success",
      "outline-danger",
    ])
    .optional(),
  size: z.enum(["default", "xs", "sm", "lg"]).optional(),
  align: z.enum(["", "start", "end"]).optional(),
  languageNames: z.record(locale, text).optional(),
});
const schema = copySchema.extend({
  navigation: z.enum(["flat", "grouped"]).default("flat"),
  assignedTaxonomies: z.boolean().default(true),
  themeToggle: z.boolean().default(false),
  languageSwitcher: z.union([z.literal(false), switcherSchema]).default(false),
  locales: z.record(locale, copySchema).optional(),
});
const messages = {
  en: {
    site: "Site",
    pages: "Pages",
    taxonomies: "Taxonomies",
    language: "Language",
    selectLanguage: "Select language",
    lightMode: "Switch to light mode",
    darkMode: "Switch to dark mode",
    closeNavigation: "Close navigation",
    onThisPage: "On this page",
    overview: "Overview",
    aside: "Page information",
  },
  de: {
    site: "Website",
    pages: "Seiten",
    taxonomies: "Taxonomien",
    language: "Sprache",
    selectLanguage: "Sprache auswählen",
    lightMode: "Hellen Modus aktivieren",
    darkMode: "Dunklen Modus aktivieren",
    closeNavigation: "Navigation schließen",
    onThisPage: "Auf dieser Seite",
    overview: "Überblick",
    aside: "Seiteninformationen",
  },
};

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function parse(schema, input, field) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = [...issue.path, ...(issue.keys ?? [])].join(".");
  throw new TypeError(`${field}${path ? `.${path}` : ""}: ${issue.message}`);
}

export function normalizePresentation(input = {}) {
  return freeze(parse(schema, input, "site.presentation"));
}

export function normalizeNamedLinks(input = {}) {
  const path = z.string().superRefine((value, context) => {
    try {
      siteHref(value);
    } catch (error) {
      context.addIssue({ code: "custom", message: error.message });
    }
  });
  return freeze(
    parse(
      z.record(
        z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u),
        z.union([path, z.record(locale, path)]),
      ),
      input,
      "site.links",
    ),
  );
}

export function resolveSitePresentation(site, locale = site.defaults.lang) {
  const presentation = site.presentation ?? normalizePresentation();
  const selected = presentation.locales?.[locale];
  return freeze({
    ...presentation,
    ...(selected?.brandDescription !== undefined
      ? { brandDescription: selected.brandDescription }
      : {}),
    labels: {
      ...(messages[locale] ?? messages.en),
      ...presentation.labels,
      ...selected?.labels,
    },
  });
}

export function validatePresentationLocales(site, profile) {
  const active = profile?.locales ?? [site.defaults.lang];
  for (const [field, map] of [
    ["site.presentation.locales", site.presentation?.locales],
    [
      "site.presentation.languageSwitcher.languageNames",
      site.presentation?.languageSwitcher?.languageNames,
    ],
    ...Object.entries(site.links ?? {})
      .filter(([, value]) => typeof value !== "string")
      .map(([name, value]) => [`site.links.${name}`, value]),
  ]) {
    for (const key of Object.keys(map ?? {})) {
      if (!active.includes(key))
        throw new TypeError(
          `${field}.${key} must belong to native Astro i18n.locales`,
        );
    }
  }
  for (const [name, value] of Object.entries(site.links ?? {})) {
    if (typeof value !== "string") {
      for (const locale of active) {
        if (!Object.hasOwn(value, locale))
          throw new TypeError(
            `site.links.${name} must provide active locale ${locale}`,
          );
      }
    }
  }
}

/** @param {import('../config/index.js').SiteConfig} site @param {{ locale?: string, i18n?: import('../context/index.js').SiteContext['i18n'], base?: string, trailingSlash?: 'always' | 'never' | 'ignore' }} [options] @returns {Readonly<Record<string, string>>} */
export function resolveContentLinks(
  site,
  {
    locale = site.defaults.lang,
    i18n = null,
    base = "/",
    trailingSlash = "ignore",
  } = {},
) {
  validatePresentationLocales(site, i18n);
  if (i18n && !i18n.locales.includes(locale))
    throw new TypeError(`locale ${locale} is not in native Astro i18n.locales`);
  const prefix =
    i18n && (locale !== i18n.defaultLocale || i18n.prefixDefaultLocale)
      ? `/${locale}`
      : "";
  return Object.freeze(
    Object.fromEntries(
      Object.entries(site.links ?? {}).map(([name, value]) => {
        const path = typeof value === "string" ? value : value[locale];
        if (path === undefined)
          throw new TypeError(
            `site.links.${name} must provide active locale ${locale}`,
          );
        return [
          name,
          siteHref(`${prefix}${path === "/" ? "" : path}` || "/", {
            base,
            trailingSlash,
          }),
        ];
      }),
    ),
  );
}
