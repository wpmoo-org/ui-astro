// Copy for the HTML sitemap page (/sitemap/ per locale) and the sitemap.xsl
// view of sitemap.xml. Same mechanism as not-found: built-in en and de copy,
// a host override per locale with moo({ sitemap: { messages } }), and the
// fallback host[locale], built-in[locale], host[main], built-in[main], en.
import { resolvePageOptions } from "../config/index.js";
import { siteHref } from "../content/paths.js";
import { localePath, validLocale } from "../i18n/profile.js";

/** Placeholders each templated field must contain exactly once. */
const placeholders = Object.freeze({
  intro: ["{count}", "{xml}", "{protocol}"],
  xmlIntro: ["{count}", "{protocol}"],
  xmlPageLink: ["{page}"],
});
export const sitemapCopyFields = Object.freeze([
  "title",
  "intro",
  "xmlLabel",
  "protocolLabel",
  "pageLabel",
  "updatedLabel",
  "topLabel",
  "noDate",
  "devNote",
  "xmlTitle",
  "xmlIntro",
  "xmlPageLink",
  "xmlPageLabel",
  "urlLabel",
  "lastModifiedLabel",
]);
const copy = Object.freeze({
  en: Object.freeze({
    title: "Sitemap",
    intro:
      "This page lists all {count} public pages of this site with a short description and, where a page records one, the date its content last changed. Search engines read the same list from the machine-readable {xml}, which follows the {protocol}.",
    xmlLabel: "XML sitemap",
    protocolLabel: "sitemaps.org protocol",
    pageLabel: "Page",
    updatedLabel: "Updated",
    topLabel: "Pages",
    noDate: "—",
    devNote:
      "The development server lists published content and static routes only. The build lists every built page.",
    xmlTitle: "XML Sitemap",
    xmlIntro:
      "This XML sitemap lists the {count} public URLs of this site for search engines such as Google and Bing. It follows the {protocol}.",
    xmlPageLink: "For a version grouped by section with page descriptions, open the {page}.",
    xmlPageLabel: "Sitemap page",
    urlLabel: "URL",
    lastModifiedLabel: "Last modified",
  }),
  de: Object.freeze({
    title: "Sitemap",
    intro:
      "Diese Seite listet alle {count} öffentlichen Seiten dieser Website mit einer kurzen Beschreibung und, wo eine Seite es angibt, dem Datum der letzten inhaltlichen Änderung. Suchmaschinen lesen dieselbe Liste aus der maschinenlesbaren {xml}, die dem {protocol} folgt.",
    xmlLabel: "XML-Sitemap",
    protocolLabel: "sitemaps.org-Protokoll",
    pageLabel: "Seite",
    updatedLabel: "Aktualisiert",
    topLabel: "Seiten",
    noDate: "—",
    devNote:
      "Der Entwicklungsserver listet nur veröffentlichte Inhalte und statische Routen. Der Build listet jede gebaute Seite.",
    xmlTitle: "XML-Sitemap",
    xmlIntro:
      "Diese XML-Sitemap listet die {count} öffentlichen URLs dieser Website für Suchmaschinen wie Google und Bing. Sie folgt dem {protocol}.",
    xmlPageLink: "Eine nach Bereichen gegliederte Fassung mit Seitenbeschreibungen bietet die {page}.",
    xmlPageLabel: "Sitemap-Seite",
    urlLabel: "URL",
    lastModifiedLabel: "Zuletzt geändert",
  }),
});

function record(value, field, keys) {
  const prototype =
    value && typeof value === "object" ? Object.getPrototypeOf(value) : undefined;
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (prototype !== Object.prototype && prototype !== null)
  )
    throw new TypeError(`${field} must be a plain object`);
  if (keys)
    for (const key of Object.keys(value))
      if (!keys.includes(key)) throw new TypeError(`${field}.${key} is unsupported`);
}

/** Whether a templated field holds each of its placeholders exactly once. */
function placeholdersValid(key, value) {
  return (placeholders[key] ?? []).every((token) => value.split(token).length === 2);
}

/** @param {{ messages?: Record<string, Record<string, string>> }} [input] */
export function normalizeSitemap(input = {}) {
  record(input, "moo.sitemap", ["messages"]);
  const dictionaries = input.messages === undefined ? {} : input.messages;
  record(dictionaries, "moo.sitemap.messages");
  const messages = {};
  for (const [locale, dictionary] of Object.entries(dictionaries)) {
    const field = `moo.sitemap.messages.${locale}`;
    if (!validLocale(locale)) throw new TypeError(`${field} must name a valid locale`);
    if (dictionary === undefined) continue;
    record(dictionary, field, sitemapCopyFields);
    const owned = {};
    for (const key of sitemapCopyFields) {
      const value = dictionary[key];
      if (value === undefined) continue;
      if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/u.test(value))
        throw new TypeError(`${field}.${key} must be nonempty plain text`);
      if (!placeholdersValid(key, value))
        throw new TypeError(
          `${field}.${key} must contain ${placeholders[key].join(", ")} exactly once each`,
        );
      owned[key] = value;
    }
    messages[locale] = Object.freeze(owned);
  }
  return Object.freeze({ messages: Object.freeze(messages) });
}

/** Site path of the HTML sitemap page for a locale, before base and slash policy. */
export function sitemapPagePath(locale, i18n) {
  return localePath("/sitemap", locale, i18n);
}

/**
 * @param {{ site: import('../config/index.js').SiteConfig, base: string, trailingSlash: 'always' | 'never' | 'ignore', i18n: { readonly locales: readonly string[], readonly defaultLocale: string, readonly prefixDefaultLocale: boolean } | null, sitemap: { messages: Readonly<Record<string, Readonly<Record<string, string>>>> } }} profile
 * @param {string} [locale]
 */
export function resolveSitemapOptions(profile, locale = profile.site.defaults.lang) {
  const main = profile.site.defaults.lang;
  const locales = profile.i18n?.locales ?? [main];
  if (!locales.includes(locale))
    throw new TypeError(`moo.sitemap locale ${String(locale)} is not active`);
  for (const key of Object.keys(profile.sitemap.messages))
    if (!locales.includes(key))
      throw new TypeError(`moo.sitemap.messages.${key} must belong to the active locales`);
  const messages = Object.fromEntries(
    sitemapCopyFields.map((key) => [
      key,
      profile.sitemap.messages[locale]?.[key] ??
        copy[locale]?.[key] ??
        profile.sitemap.messages[main]?.[key] ??
        copy[main]?.[key] ??
        copy.en[key],
    ]),
  );
  const languageLinks = Object.freeze(
    locales.map((value) =>
      Object.freeze({
        locale: value,
        href: siteHref(sitemapPagePath(value, profile.i18n), profile),
      }),
    ),
  );
  return Object.freeze({
    copy: Object.freeze(messages),
    locale,
    site: profile.site,
    href: languageLinks.find((link) => link.locale === locale).href,
    xmlHref: `${siteHref("/", { ...profile, trailingSlash: "always" })}sitemap.xml`,
    options: resolvePageOptions(profile.site, "page", "single", undefined, locale),
    languageLinks,
  });
}
