import { validLocale } from "./profile.js";

export function entryLocale(entry, profile, fallback) {
  const locale = entry.data?.locale ?? (profile ? undefined : fallback);
  const label = `${entry.collection} ${entry.id}`;
  if (!locale)
    throw new TypeError(`${label} locale is required with native Astro i18n`);
  if (
    !validLocale(locale) ||
    (profile ? !profile.locales.includes(locale) : locale !== fallback)
  )
    throw new TypeError(`${label} locale ${String(locale)} is not active`);
  if (
    profile &&
    entry.data.options?.lang !== undefined &&
    entry.data.options.lang !== locale
  )
    throw new TypeError(
      `${label} options.lang must agree with locale ${locale}`,
    );
  return locale;
}

export function urlEntry(entry, locale, sourceKind) {
  if (
    sourceKind !== "markdown" ||
    entry.data.slug !== undefined ||
    !entry.id.startsWith(`${locale}/`)
  )
    return entry;
  // Project the URL only. The native filename ID and provenance remain exact.
  return {
    ...entry,
    data: {
      ...entry.data,
      slug: entry.id.slice(locale.length + 1).replace(/\.(?:md|mdx)$/u, ""),
    },
  };
}

export function translationGraph(sources, profile, fallback, hrefFor) {
  const groups = new Map();
  const members = new Map();
  for (const { type, entries } of sources) {
    for (const entry of entries) {
      const locale = entryLocale(entry, profile, fallback);
      const key = entry.data.translationKey;
      if (key === undefined) continue;
      if (typeof key !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(key))
        throw new TypeError(
          `${type.id} ${entry.id} translationKey must be a stable lowercase kebab ID`,
        );
      const groupId = JSON.stringify([type.id, key]);
      const group = groups.get(groupId) ?? new Map();
      if (group.has(locale))
        throw new TypeError(
          `${type.id} translationKey ${key} locale ${locale} has duplicate entries ${group.get(locale).entry.id} and ${entry.id}`,
        );
      group.set(locale, {
        entry,
        locale,
        href: entry.data.status === "publish" ? hrefFor(type.id, entry) : null,
      });
      groups.set(groupId, group);
      members.set(JSON.stringify([type.id, entry.id]), group);
    }
  }
  return { members, locales: profile?.locales ?? [fallback] };
}

export function languageLinks(graph, type, entry) {
  if (entry.data?.status !== "publish")
    throw new TypeError(
      `${type} ${entry.id} must be publish to have language links`,
    );
  const group = graph.members.get(JSON.stringify([type, entry.id]));
  return Object.freeze(
    graph.locales.flatMap((locale) => {
      const item = group?.get(locale);
      return item?.href ? [Object.freeze({ locale, href: item.href })] : [];
    }),
  );
}
