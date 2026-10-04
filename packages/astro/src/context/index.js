import { taxonomyNamespaces, taxonomyTermPath } from "../taxonomies/urls.js";
import context, { collections } from "virtual:wpmoo-astro/routes";
import { mkdir, writeFile } from "node:fs/promises";
import {
  validateJsonDirectorySource,
  validateJsonFileSource,
  validateMarkdownSource,
  validateSelectedCollections,
} from "../content/integrity.js";
import { entryPath, siteHref } from "../content/paths.js";
import {
  navigationFromDescriptors,
  navigationFromPages,
} from "../integration/navigation.js";
import { pagePathsFromEntries } from "../plugins/page/paths.js";
import { getPublishedPages } from "../plugins/page/queries.js";
import { postPathsFromEntries } from "../plugins/post/paths.js";
import { validateReferences, validateTerms } from "../taxonomies/paths.js";
import { entryLocale, translationGraph, urlEntry } from "../i18n/graph.js";
import { localePath, validateLocaleKeys } from "../i18n/profile.js";
import { nativeLocaleHref } from "../i18n/href.js";

function freezeData(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}

const publicContext = freezeData({
  site: context.site,
  base: context.base,
  trailingSlash: context.trailingSlash,
  plugins: context.plugins,
  taxonomies: context.taxonomies,
  taxonomyBasePath: context.taxonomyBasePath,
  i18n: context.i18n,
});

export function getSiteContext() {
  return publicContext;
}

function reservedPrefixes(typeId, locale) {
  return [
    ...context.plugins
      .filter(
        (plugin) =>
          !plugin.contentTypes.some((type) => type.id === typeId) &&
          plugin.basePath !== "/",
      )
      .map((plugin) => plugin.locales?.[locale]?.basePath ?? plugin.basePath),
    ...taxonomyNamespaces(context, locale ?? context.site.defaults.lang),
    ...(context.i18n ? context.i18n.locales.map((value) => `/${value}`) : []),
  ];
}

function entryHref(typeId, entry) {
  const type = context.plugins
    .flatMap((plugin) => plugin.contentTypes)
    .find((item) => item.id === typeId);
  if (!type)
    throw new TypeError(`Content type ${String(typeId)} is not active`);
  if (!entry || entry.collection !== type.collection) {
    throw new TypeError(
      `${typeId} entry must belong to collection ${type.collection}`,
    );
  }
  const locale = entryLocale(entry, context.i18n, context.site.defaults.lang);
  const language = context.i18n ? locale : context.site.defaults.lang;
  const plugin = context.plugins.find((item) =>
    item.contentTypes.some((value) => value.id === typeId),
  );
  const prefix = context.singlePrefixes[typeId];
  const localizedPrefix = plugin.locales?.[locale]?.basePath
    ? `${plugin.locales[locale].basePath === "/" ? "" : plugin.locales[locale].basePath}${prefix.slice(plugin.basePath === "/" ? 0 : plugin.basePath.length)}`
    : prefix;
  const projected = context.i18n
    ? urlEntry(entry, locale, type.sourceKind)
    : entry;
  const path =
    typeId === "page"
      ? pagePathsFromEntries(
          [{ ...projected, data: { ...projected.data, status: "publish" } }],
          {
            lang: language,
            reservedPrefixes: reservedPrefixes(typeId, locale),
          },
        ).map(({ params }) => (params.slug ? `/${params.slug}` : "/"))[0]
      : entryPath(projected, {
          type: typeId,
          prefix: localizedPrefix,
          sourceKind: type.sourceKind,
          lang: language,
        }).href;
  return context.i18n
    ? nativeLocaleHref(path, locale, context)
    : siteHref(path, context);
}

export function getEntryHref(typeId, entry) {
  if (entry?.data?.status !== "publish")
    throw new TypeError(
      `${typeId} entry ${String(entry?.id)} must be publish to have a public href`,
    );
  return entryHref(typeId, entry);
}

export async function getSiteNavigation(
  currentPath,
  locale = context.i18n?.defaultLocale ?? context.site.defaults.lang,
) {
  const activePage = context.plugins.some(
    (plugin) =>
      plugin.id === "page" &&
      plugin.contentTypes.some(
        (type) => type.id === "page" && type.collection === "page",
      ),
  );
  const pages = activePage
    ? (await getPublishedPages()).filter(
        (entry) => !context.i18n || entry.data.locale === locale,
      )
    : [];
  if (context.i18n && !context.i18n.locales.includes(locale))
    throw new TypeError(`navigation locale ${locale} is not active`);
  if (context.i18n) {
    const current = currentPath.replace(/\/$/u, "") || "/";
    const items = pages.map((entry) => {
      const href = getEntryHref("page", entry);
      return Object.freeze({
        label: entry.data.navLabel ?? entry.data.title,
        href,
        active: (href.replace(/\/$/u, "") || "/") === current,
      });
    });
    for (const plugin of context.plugins) {
      const localized = plugin.locales?.[locale];
      for (const item of context.navigation.filter(
        (value) =>
          plugin.basePath !== "/" &&
          (value.path === plugin.basePath ||
            value.path.startsWith(`${plugin.basePath}/`)),
      )) {
        const path = `${localized?.basePath ?? plugin.basePath}${item.path.slice(plugin.basePath.length)}`;
        const href = nativeLocaleHref(path, locale, context);
        const canonical = href.replace(/\/$/u, "");
        items.push(
          Object.freeze({
            label:
              item.label === plugin.label
                ? (localized?.label ?? item.label)
                : item.label,
            href,
            active:
              current === canonical ||
              (item.match === "prefix" && current.startsWith(`${canonical}/`)),
          }),
        );
      }
    }
    return Object.freeze(items);
  }
  const options = {
    lang: context.site.defaults.lang,
    base: context.base,
    trailingSlash: context.trailingSlash,
    reservedPrefixes: reservedPrefixes("page"),
  };
  return Object.freeze([
    ...navigationFromPages(pages, currentPath, options),
    ...navigationFromDescriptors(context.navigation, currentPath, options),
  ]);
}

export async function validateSiteContent() {
  // Dev middleware survives HMR; query the current native content module.
  const { getCollection } = await import("astro:content");
  validateSelectedCollections(
    collections,
    context.sources.map((source) => source.collection),
  );
  const loaded = new Map();
  const terms = new Map();
  for (const source of context.sources) {
    const common = {
      collection: source.collection,
      root: new URL(context.root),
      entries: await getCollection(source.collection),
    };
    loaded.set(source.collection, common.entries);
    if (source.kind === "markdown") {
      await validateMarkdownSource({
        ...common,
        base: new URL(source.base),
        formats: source.formats,
        schema: collections[source.collection].schema,
      });
    } else if (source.kind === "json-directory") {
      await validateJsonDirectorySource({
        ...common,
        base: new URL(source.base),
        schema: collections[source.collection].schema,
      });
    } else if (source.kind === "json") {
      await validateJsonFileSource({
        ...common,
        file: new URL(source.file),
        schema: collections[source.collection].schema,
        arrayOnly: context.taxonomies.some(
          (taxonomy) => taxonomy.id === source.collection,
        ),
      });
    } else {
      throw new TypeError(
        `${source.collection} source kind ${source.kind} is unsupported by this integrity gate`,
      );
    }
    const taxonomy = context.taxonomies.find(
      (taxonomy) => taxonomy.id === source.collection,
    );
    if (taxonomy) {
      for (const term of common.entries) {
        if (context.i18n)
          validateLocaleKeys(
            term.data.locales,
            context.i18n,
            `${taxonomy.id} ${term.id}.locales`,
          );
      }
      for (const locale of context.i18n?.locales ?? [
        context.site.defaults.lang,
      ])
        validateTerms(taxonomy, common.entries, { lang: locale });
      terms.set(
        taxonomy.id,
        validateTerms(taxonomy, common.entries, {
          lang: context.site.defaults.lang,
        }),
      );
    }
    if (!context.i18n && source.collection === "page") {
      pagePathsFromEntries(common.entries, {
        lang: context.site.defaults.lang,
        reservedPrefixes: reservedPrefixes("page"),
      });
    } else if (!context.i18n && source.collection === "post") {
      postPathsFromEntries(common.entries, {
        lang: context.site.defaults.lang,
        basePath: context.singlePrefixes.post,
      });
    }
  }
  const sources = context.plugins
    .flatMap((plugin) => plugin.contentTypes)
    .map((type) => ({ type, entries: loaded.get(type.collection) }));
  translationGraph(
    sources,
    context.i18n,
    context.site.defaults.lang,
    getEntryHref,
  );
  const claimed = new Map();
  const expected = context.archivePaths.map((path) => ({
    id: "archive",
    path,
  }));
  for (const type of context.plugins.flatMap((plugin) => plugin.contentTypes)) {
    const entries = loaded.get(type.collection);
    validateReferences(type, entries, terms);
    if (!context.i18n && (type.id === "page" || type.id === "post")) continue;
    for (const entry of entries) {
      const href = entryHref(type.id, entry);
      if (entry.data.status !== "publish" && entry.data.status !== "future")
        continue;
      const previous = claimed.get(href);
      if (previous)
        throw new TypeError(
          `${type.id} URL collision: ${previous} and ${entry.id} both map to ${href}`,
        );
      claimed.set(href, `${type.id}/${entry.id}`);
      if (entry.data.status === "publish") {
        const mount = context.base.replace(/\/$/u, "");
        expected.push({
          id: `${type.id}/${entry.id}`,
          path: href.slice(mount.length).replace(/\/$/u, "") || "/",
        });
      }
    }
  }
  if (context.projectionFile) {
    for (const taxonomy of context.taxonomies.filter((item) => item.archive)) {
      for (const locale of context.i18n.locales) {
        for (const term of validateTerms(taxonomy, loaded.get(taxonomy.id), {
          lang: locale,
        }).values()) {
          expected.push({
            id: `${taxonomy.id}/${term.id}/${locale}`,
            path: localePath(
              taxonomyTermPath(taxonomy, term, {
                lang: locale,
                taxonomyBasePath: context.taxonomyBasePath,
              }),
              locale,
              context.i18n,
            ),
          });
        }
      }
    }
    const target = new URL(context.projectionFile);
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, JSON.stringify(expected));
  }
}
