import { resolvePageOptions } from "../config/index.js";
import { siteHref } from "../content/paths.js";
import { localePath, validLocale } from "../i18n/profile.js";

/** @typedef {import('./index.js').NotFoundInput} NotFoundInput */
/** @typedef {{ routeOwner: 'plugin' | 'host', messages: Readonly<Record<string, Readonly<Partial<import('./index.js').NotFoundMessages>>>> }} NotFoundPolicy */
/** @typedef {{ site: import('../config/index.js').SiteConfig, base: string, trailingSlash: 'always' | 'never' | 'ignore', i18n: { readonly locales: readonly string[], readonly defaultLocale: string, readonly prefixDefaultLocale: boolean } | null, notFound: NotFoundPolicy }} NotFoundProfile */

const fields = ["title", "description", "homeLabel"];
const copy = Object.freeze({
  en: Object.freeze({
    title: "Page not found",
    description: "The page you requested could not be found.",
    homeLabel: "Back to home",
  }),
  de: Object.freeze({
    title: "Seite nicht gefunden",
    description: "Die angeforderte Seite wurde nicht gefunden.",
    homeLabel: "Zur Startseite",
  }),
});

function record(value, field, keys) {
  const prototype =
    value && typeof value === "object"
      ? Object.getPrototypeOf(value)
      : undefined;
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (prototype !== Object.prototype && prototype !== null)
  )
    throw new TypeError(`${field} must be a plain object`);
  if (keys)
    for (const key of Object.keys(value)) {
      if (!keys.includes(key))
        throw new TypeError(`${field}.${key} is unsupported`);
    }
}

/** @param {NotFoundInput} [input] @returns {NotFoundPolicy} */
export function normalizeNotFound(input = {}) {
  record(input, "moo.notFound", ["routeOwner", "messages"]);
  const routeOwner =
    input.routeOwner === undefined ? "plugin" : input.routeOwner;
  if (!["plugin", "host"].includes(routeOwner))
    throw new TypeError('moo.notFound.routeOwner must be "plugin" or "host"');
  const dictionaries = input.messages === undefined ? {} : input.messages;
  record(dictionaries, "moo.notFound.messages");
  const messages = {};
  for (const [locale, dictionary] of Object.entries(dictionaries)) {
    const field = `moo.notFound.messages.${locale}`;
    if (!validLocale(locale))
      throw new TypeError(`${field} must name a valid locale`);
    if (dictionary === undefined) continue;
    record(dictionary, field, fields);
    const owned = {};
    for (const key of fields) {
      const value = dictionary[key];
      if (value === undefined) continue;
      if (
        typeof value !== "string" ||
        !value.trim() ||
        /[\x00-\x1f\x7f]/u.test(value)
      )
        throw new TypeError(`${field}.${key} must be nonempty plain text`);
      owned[key] = value;
    }
    messages[locale] = Object.freeze(owned);
  }
  return Object.freeze({ routeOwner, messages: Object.freeze(messages) });
}

/** @param {NotFoundProfile} profile @param {string} [locale] @returns {import('./index.js').NotFoundOptions} */
export function resolveNotFoundOptions(
  profile,
  locale = profile.site.defaults.lang,
) {
  const main = profile.site.defaults.lang;
  const locales = profile.i18n?.locales ?? [main];
  if (!locales.includes(locale))
    throw new TypeError(`moo.notFound locale ${String(locale)} is not active`);
  for (const key of Object.keys(profile.notFound.messages)) {
    if (!locales.includes(key))
      throw new TypeError(
        `moo.notFound.messages.${key} must belong to the active locales`,
      );
  }
  const messages = Object.fromEntries(
    fields.map((key) => [
      key,
      profile.notFound.messages[locale]?.[key] ??
        copy[locale]?.[key] ??
        profile.notFound.messages[main]?.[key] ??
        copy[main]?.[key] ??
        copy.en[key],
    ]),
  );
  const languageLinks = Object.freeze(
    locales.map((value) =>
      Object.freeze({
        locale: value,
        href: siteHref(localePath("/", value, profile.i18n), profile),
      }),
    ),
  );
  return Object.freeze({
    ...messages,
    locale,
    brand: profile.site.brand,
    href: siteHref(localePath("/404", locale, profile.i18n), profile),
    homeHref: languageLinks.find((link) => link.locale === locale).href,
    options: resolvePageOptions(
      profile.site,
      "page",
      "single",
      undefined,
      locale,
    ),
    languageLinks,
  });
}
