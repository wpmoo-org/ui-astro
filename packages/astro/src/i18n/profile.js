import { resolveTaxonomyArchive } from "../taxonomies/urls.js";
import { buildRegistry } from "../integration/registry.js";

export function validLocale(value) {
  if (typeof value !== "string") return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

export function validateLocaleKeys(values, profile, field) {
  for (const key of Object.keys(values ?? {})) {
    if (!profile?.locales.includes(key))
      throw new TypeError(
        `${field}.${key} must belong to native Astro i18n.locales`,
      );
  }
}

export function resolveI18n(native, site) {
  if (!native) {
    if (Object.keys(site.locales ?? {}).length)
      throw new TypeError("site.locales requires native Astro i18n");
    return null;
  }
  if (
    !Array.isArray(native.locales) ||
    !native.locales.length ||
    native.locales.some(
      (locale) =>
        !validLocale(locale) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(locale),
    )
  ) {
    throw new TypeError(
      "moo i18n requires canonical lowercase native string locales; alias locale objects are not certified",
    );
  }
  if (
    new Set(native.locales).size !== native.locales.length ||
    !native.locales.includes(native.defaultLocale)
  )
    throw new TypeError(
      "moo i18n requires unique locales and a declared defaultLocale",
    );
  if (
    native.routing === "manual" ||
    Object.keys(native.domains ?? {}).length ||
    Object.keys(native.fallback ?? {}).length
  ) {
    throw new TypeError(
      "moo i18n content and native errors do not support manual routing, domains or automatic fallback pages",
    );
  }
  if (site.defaults.lang !== native.defaultLocale)
    throw new TypeError(
      "site.defaults.lang must agree with native Astro i18n.defaultLocale",
    );
  const profile = Object.freeze({
    locales: Object.freeze([...native.locales]),
    defaultLocale: native.defaultLocale,
    prefixDefaultLocale: native.routing?.prefixDefaultLocale ?? false,
  });
  validateLocaleKeys(site.locales, profile, "site.locales");
  for (const [locale, options] of Object.entries(site.locales ?? {})) {
    if (options.lang !== undefined && options.lang !== locale)
      throw new TypeError(
        `site.locales.${locale}.lang must agree with locale ${locale}`,
      );
  }
  return profile;
}

export function localePath(path, locale, profile) {
  if (!profile) return path;
  if (!profile.locales.includes(locale))
    throw new TypeError(
      `locale ${String(locale)} is not in native Astro i18n.locales`,
    );
  const prefix =
    locale === profile.defaultLocale && !profile.prefixDefaultLocale
      ? ""
      : `/${locale}`;
  return `${prefix}${path === "/" ? "" : path}` || "/";
}

export function localizeRegistry(registry, profile) {
  if (!profile) {
    for (const item of [...registry.plugins, ...registry.taxonomies])
      validateLocaleKeys(item.locales, null, `${item.id}.locales`);
    return buildRegistry(registry.plugins, {
      taxonomies: registry.taxonomies,
      taxonomyBasePath: registry.taxonomyBasePath,
      taxonomyRoutes: registry.taxonomyRoutes,
      lang: registry.lang,
    });
  }
  for (const item of [...registry.plugins, ...registry.taxonomies])
    validateLocaleKeys(item.locales, profile, `${item.id}.locales`);
  if (
    registry.taxonomies.some(
      (taxonomy) =>
        taxonomy.archive &&
        taxonomy.archive.basePath === undefined &&
        profile.locales.some(
          (locale) => taxonomy.locales?.[locale]?.basePath === undefined,
        ),
    ) &&
    profile.locales.some(
      (locale) =>
        registry.taxonomyBasePath === `/${locale}` ||
        registry.taxonomyBasePath.startsWith(`/${locale}/`),
    )
  ) {
    throw new TypeError(
      `moo.taxonomyBasePath ${registry.taxonomyBasePath} conflicts with a native locale prefix`,
    );
  }
  const projections = profile.locales.map((locale) => {
    const taxonomySlugs = new Map();
    for (const taxonomy of registry.taxonomies.filter((item) => item.archive)) {
      const archive = resolveTaxonomyArchive(taxonomy, {
        lang: locale,
        taxonomyBasePath: registry.taxonomyBasePath,
      });
      if (
        profile.locales.some(
          (value) =>
            archive.basePath === `/${value}` ||
            archive.basePath.startsWith(`/${value}/`),
        )
      )
        throw new TypeError(
          `taxonomy ${taxonomy.id} locales.${locale}.basePath ${archive.basePath} conflicts with a native locale prefix`,
        );
      if (archive.taxonomySegment === undefined) continue;
      const slug = archive.taxonomySegment;
      const previous = taxonomySlugs.get(slug);
      if (previous)
        throw new TypeError(
          `taxonomy locale ${locale} namespace collision: ${previous} and ${taxonomy.id} both use ${slug}`,
        );
      taxonomySlugs.set(slug, taxonomy.id);
    }
    const plugins = registry.plugins.map((plugin) => {
      const localized = plugin.locales?.[locale];
      const basePath = localized?.basePath ?? plugin.basePath;
      if (
        profile.locales.some(
          (value) =>
            basePath === `/${value}` || basePath.startsWith(`/${value}/`),
        )
      )
        throw new TypeError(
          `${plugin.id} locale ${locale} namespace ${basePath} conflicts with a native locale prefix`,
        );
      const label = localized?.label ?? plugin.label;
      return {
        ...plugin,
        label,
        basePath,
        navigation: plugin.navigation.map((item) => ({
          ...item,
          label: item.label === plugin.label ? label : item.label,
          path:
            basePath === "/"
              ? item.path
              : `${basePath}${item.path.slice(plugin.basePath.length)}`,
        })),
      };
    });
    const selected = buildRegistry(plugins, {
      taxonomies: registry.taxonomies,
      taxonomyBasePath: registry.taxonomyBasePath,
      taxonomyRoutes: registry.taxonomyRoutes,
      lang: locale,
    });
    return { locale, registry: selected };
  });
  return Object.freeze({
    ...registry,
    projections: Object.freeze(projections),
    taxonomyGroups: Object.freeze(
      projections.flatMap(({ locale, registry: selected }) =>
        selected.taxonomyGroups.map((group) =>
          Object.freeze({
            ...group,
            locale,
            pattern: localePath(group.pattern, locale, profile),
          }),
        ),
      ),
    ),
    routeClaims: Object.freeze(
      projections.flatMap(({ locale, registry: selected }) =>
        selected.routeClaims.map((claim) =>
          Object.freeze({
            ...claim,
            locale,
            pattern: localePath(claim.pattern, locale, profile),
          }),
        ),
      ),
    ),
    routes: Object.freeze(
      projections.flatMap(({ locale, registry: selected }) =>
        selected.routes.map((route) =>
          Object.freeze({
            ...route,
            locale,
            pattern: localePath(route.pattern, locale, profile),
          }),
        ),
      ),
    ),
  });
}
