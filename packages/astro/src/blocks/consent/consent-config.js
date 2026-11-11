// Shared helpers for the Consent blocks: localized text, built-in EN/DE
// labels and Core's revision rule, computed at build time.
import { createHash } from "node:crypto";

export const STORAGE_TYPES = ["cookie", "local", "session", "pixel"];
const REMOVABLE = new Set(["cookie", "local", "session"]);
const KEY = /^[a-z][a-z0-9_]{0,31}$/;

const LABELS = {
  en: {
    title: "Manage consent",
    text: "We use cookies and similar technologies. Functional ones keep the site working; the others load only with your consent, which you can change at any time under Cookie settings.",
    acceptAll: "Accept all",
    decline: "Decline",
    save: "Save choices",
    alwaysActive: "Always active",
    provider: "Provider",
    purpose: "Purpose",
    storage: "Cookies and storage",
    privacy: "Privacy policy",
    service: "Service",
    links: "Legal information",
    settings: "Cookie settings",
    load: "Load content",
    remember: "Always allow",
    types: { cookie: "Cookie", local: "Local storage", session: "Session storage", pixel: "Pixel" },
  },
  de: {
    title: "Einwilligung verwalten",
    text: "Wir verwenden Cookies und ähnliche Technologien. Funktionale halten die Website in Betrieb; die übrigen werden nur mit Ihrer Einwilligung geladen, die Sie jederzeit unter Cookie-Einstellungen ändern können.",
    acceptAll: "Alle akzeptieren",
    decline: "Ablehnen",
    save: "Auswahl speichern",
    alwaysActive: "Immer aktiv",
    provider: "Anbieter",
    purpose: "Zweck",
    storage: "Cookies und Speicher",
    privacy: "Datenschutzerklärung",
    service: "Dienst",
    links: "Rechtliche Hinweise",
    settings: "Cookie-Einstellungen",
    load: "Inhalt laden",
    remember: "Immer erlauben",
    types: { cookie: "Cookie", local: "Lokaler Speicher", session: "Sitzungsspeicher", pixel: "Pixel" },
  },
};

function language(locale) {
  return String(locale || "en").toLowerCase().split(/[-_]/)[0];
}

/** A string, or a map such as { en, de }: the locale's text, then English, then the first. */
export function localize(value, locale) {
  if (value == null || typeof value === "string") return value ?? "";
  const lang = language(locale);
  return value[locale] ?? value[lang] ?? value.en ?? Object.values(value)[0] ?? "";
}

/** Built-in labels for the locale (EN or DE), with any overrides merged in. */
export function consentLabels(locale, overrides = {}) {
  const base = LABELS[language(locale)] ?? LABELS.en;
  return { ...base, ...overrides, types: { ...base.types, ...(overrides.types ?? {}) } };
}

/** Validates the configuration and returns the categories that are shown. */
export function shownCategories(config) {
  if (!config || !Array.isArray(config.categories)) throw new TypeError("Consent requires a config with categories.");
  const seen = new Set();
  for (const category of config.categories) {
    if (!KEY.test(category.id ?? "")) throw new TypeError(`Consent category id is invalid: ${category.id}`);
    if (seen.has(category.id)) throw new TypeError(`Consent category ids must be unique: ${category.id}`);
    seen.add(category.id);
    if (category.required && category.id !== "functional") {
      throw new TypeError("Only the functional consent category may be required.");
    }
    for (const service of category.services ?? []) {
      if (!service.id || !service.name) throw new TypeError("Consent service id and name are required.");
      for (const item of service.storage ?? []) {
        if (!STORAGE_TYPES.includes(item.type)) throw new TypeError(`Unknown consent storage type: ${item.type}`);
      }
    }
  }
  return config.categories.filter((category) => (category.services ?? []).length);
}

/** Core's revision rule, synchronously for the build. */
export function revisionOf(config) {
  if (config.revision) return String(config.revision);
  const lines = shownCategories(config)
    .flatMap((category) => category.services.map((service) => `${category.id}/${service.id}`))
    .sort();
  if (config.reask > 0) lines.push(`reask:${config.reask}`);
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 12);
}

/** The ids-only configuration consent.js reads from the card. */
export function runtimeConfig(config) {
  const cookie = { name: "moo_consent", days: 365, ...(config.cookie ?? {}) };
  return {
    revision: revisionOf(config),
    cookie,
    categories: shownCategories(config).map((category) =>
      category.id === "functional" && category.required
        ? { id: category.id, required: true }
        : {
            id: category.id,
            required: false,
            storage: category.services.flatMap((service) =>
              (service.storage ?? [])
                .filter((item) => REMOVABLE.has(item.type))
                .map((item) => ({ name: item.name, type: item.type })),
            ),
          },
    ),
  };
}

/** JSON for a <script> element: < > & cannot end it early. */
export function scriptJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
