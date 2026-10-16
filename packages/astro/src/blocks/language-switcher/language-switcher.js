import { navigationHref } from "../../internal/href.js";

/** @param {unknown} value @param {string} field @returns {string} */
function text(value, field) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${field} must be nonempty text`);
  return value;
}

/** @param {unknown} value @param {string} field @returns {string} */
function localeIdentity(value, field) {
  text(value, field);
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    throw new TypeError(`${field} must be a valid locale`);
  }
}

/** @param {string} locale @returns {string} */
function nativeName(locale) {
  try {
    return (
      new Intl.DisplayNames([locale], {
        type: "language",
        fallback: "code",
      }).of(locale) || locale
    );
  } catch {
    return locale;
  }
}

/**
 * @param {{ links: readonly import('../../i18n/index.js').LanguageLink[], currentLocale: string, label: string, menuLabel?: string, languageNames?: Readonly<Record<string, string>>, labelVisibility?: 'responsive' | 'visible' | 'hidden' }} input
 */
export function resolveLanguageSwitcher({
  links,
  currentLocale,
  label,
  menuLabel,
  languageNames = {},
  labelVisibility = "responsive",
}) {
  text(label, "LanguageSwitcher.label");
  if (menuLabel !== undefined) text(menuLabel, "LanguageSwitcher.menuLabel");
  const current = localeIdentity(
    currentLocale,
    "LanguageSwitcher.currentLocale",
  );
  if (!["responsive", "visible", "hidden"].includes(labelVisibility))
    throw new TypeError(
      "LanguageSwitcher.labelVisibility must be responsive, visible or hidden",
    );
  if (!Array.isArray(links))
    throw new TypeError("LanguageSwitcher.links must be an array");
  if (
    !languageNames ||
    typeof languageNames !== "object" ||
    Array.isArray(languageNames)
  )
    throw new TypeError(
      "LanguageSwitcher.languageNames must be a locale-to-name map",
    );
  const names = new Map();
  for (const [locale, name] of Object.entries(languageNames)) {
    const identity = localeIdentity(
      locale,
      "LanguageSwitcher.languageNames key",
    );
    if (names.has(identity))
      throw new TypeError(
        `LanguageSwitcher.languageNames has duplicate locale ${locale}`,
      );
    names.set(identity, text(name, `LanguageSwitcher.languageNames.${locale}`));
  }
  const seen = new Set();
  const items = Array.from(links, (link, index) => {
    const field = `LanguageSwitcher.links[${index}]`;
    if (!link || typeof link !== "object")
      throw new TypeError(`${field} must be a language link`);
    const identity = localeIdentity(link.locale, `${field}.locale`);
    if (seen.has(identity))
      throw new TypeError(
        `LanguageSwitcher.links has duplicate locale ${link.locale}`,
      );
    seen.add(identity);
    const href = navigationHref(link.href, `${field}.href`);
    if (!href.startsWith("/"))
      throw new TypeError(
        `${field}.href must be a root-relative same-site URL`,
      );
    return Object.freeze({
      label: names.get(identity) ?? nativeName(link.locale),
      href,
      active: identity === current,
      lang: link.locale,
      hreflang: link.locale,
    });
  });
  return Object.freeze({
    visible: items.length > 1,
    label,
    menuLabel,
    labelVisibility,
    items: Object.freeze(items),
  });
}
