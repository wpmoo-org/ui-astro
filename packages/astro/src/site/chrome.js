import { resolveSitePresentation } from "./presentation.js";

/** @param {readonly Pick<import('../taxonomies/index.js').Taxonomy, 'id' | 'label' | 'locales'>[]} taxonomies @param {readonly import('../taxonomies/queries.js').TaxonomyPath[]} paths @param {string} locale @returns {import('./index.js').TaxonomyLinkGroup[]} */
export function groupTaxonomyLinks(taxonomies, paths, locale) {
  return taxonomies
    .map((taxonomy) => ({
      id: taxonomy.id,
      label: taxonomy.locales?.[locale]?.label ?? taxonomy.label,
      links: paths
        .filter((path) => path.props.taxonomy === taxonomy.id)
        .map(({ props }) => ({
          id: props.term.id,
          label: props.term.name,
          href: props.href,
        })),
    }))
    .filter((group) => group.links.length);
}

/** @param {Pick<import('../config/index.js').EntryClassContext, 'taxonomies'>} entry @param {readonly import('./index.js').TaxonomyLinkGroup[]} groups @returns {import('./index.js').TaxonomyLinkGroup[]} */
export function entryTaxonomyGroups(entry, groups) {
  return groups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) =>
        entry.taxonomies?.[group.id]?.includes(link.id),
      ),
    }))
    .filter((group) => group.links.length);
}

export function buildSiteNavigation({
  context,
  links,
  taxonomyGroups,
  locale,
  href,
  presentation,
  localHref,
}) {
  const item = (link) => ({
    title: link.label,
    href: link.href,
    active: link.active,
  });
  if (presentation.navigation === "flat") return [{ items: links.map(item) }];
  const canonical = (path) => path.replace(/\/$/u, "") || "/";
  const active = (path) => canonical(path) === canonical(href);
  const nonRoot = context.plugins
    .map((plugin) => ({
      plugin,
      prefix: canonical(
        localHref(plugin.locales?.[locale]?.basePath ?? plugin.basePath),
      ),
      basePath: plugin.locales?.[locale]?.basePath ?? plugin.basePath,
    }))
    .filter(({ basePath }) => basePath !== "/")
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const buckets = new Map(nonRoot.map(({ plugin }) => [plugin.id, []]));
  const pages = [];
  for (const link of links) {
    const path = canonical(link.href);
    const owner = nonRoot.find(
      ({ prefix }) => path === prefix || path.startsWith(`${prefix}/`),
    );
    if (owner) buckets.get(owner.plugin.id).push(item(link));
    else pages.push(item(link));
  }
  const contentItems = pages.length
    ? [
        {
          title: presentation.labels.pages,
          icon: "file-text",
          open: pages.some((page) => page.active),
          children: pages,
        },
      ]
    : [];
  for (const plugin of context.plugins) {
    const children = buckets.get(plugin.id);
    if (!children?.length) continue;
    contentItems.push(
      children.length === 1
        ? { ...children[0], icon: "file-text" }
        : {
            title: plugin.locales?.[locale]?.label ?? plugin.label,
            icon: "file-text",
            open: children.some((child) => child.active),
            children,
          },
    );
  }
  return [
    ...(contentItems.length
      ? [{ label: presentation.labels.site, items: contentItems }]
      : []),
    ...(taxonomyGroups.length
      ? [
          {
            label: presentation.labels.taxonomies,
            items: taxonomyGroups.map((group) => ({
              title: group.label,
              icon: "layout-grid",
              open: group.links.some((link) => active(link.href)),
              children: group.links.map((link) => ({
                title: link.label,
                href: link.href,
                active: active(link.href),
              })),
            })),
          },
        ]
      : []),
  ];
}

/** @param {import('./index.js').SiteChrome} chrome */
export function projectHeaderNavigation(chrome) {
  const labels = chrome.presentation.labels;
  const home = chrome.homeNavigation;
  const taxonomyHrefs = new Set(chrome.taxonomyGroups.flatMap((group) =>
    group.links.map((link) => canonicalHref(link.href))));
  const activeHrefs = new Set(chrome.navigation.flatMap((group) => group.items)
    .flatMap((item) => [item, ...(item.children ?? [])])
    .flatMap((item) => item.active && item.href ? [canonicalHref(item.href)] : []));
  const siteGroups = chrome.navigation.map((group) => ({
    ...group,
    items: group.items.flatMap((item) => {
      if (item.href && taxonomyHrefs.has(canonicalHref(item.href))) return [];
      if (item.children?.length && item.children.every((child) => child.href && taxonomyHrefs.has(canonicalHref(child.href)))) return [];
      if (home && item.href && canonicalHref(item.href) === canonicalHref(home.href)) return [];
      if (!item.children?.length) return [{ ...item }];
      const children = item.children.filter((child) => !home || !child.href || canonicalHref(child.href) !== canonicalHref(home.href));
      return children.length ? [{ ...item, children, open: children.some((child) => child.active) }] : [];
    }),
  })).filter((group) => group.items.length);
  if (home) {
    const item = { title: labels.home, href: home.href, active: home.active };
    if (siteGroups.length) siteGroups[0] = { ...siteGroups[0], items: [item, ...siteGroups[0].items] };
    else siteGroups.push({ label: labels.site, items: [item] });
  }
  const collectionItems = chrome.taxonomyGroups.filter((group) => group.links.length).map((group) => {
    const children = group.links.map((link) => ({
      title: link.label, href: link.href, active: activeHrefs.has(canonicalHref(link.href)),
    }));
    return { title: group.label, icon: "layout-grid", children, open: children.some((child) => child.active) };
  });
  return {
    siteItems: siteGroups.flatMap((group) => group.items),
    collectionItems,
    groups: [...siteGroups, ...(collectionItems.length ? [{ label: labels.collections, items: collectionItems }] : [])],
  };
}

// The brand links Home when a plugin declares a static root route, even when
// navigation leaves Home out; otherwise it falls back to the first link.
export function resolveHomeHref({ links, localeHome, href, ownsRoot }) {
  const homeLink = links.find((link) => canonicalHref(link.href) === canonicalHref(localeHome));
  return homeLink?.href ?? (ownsRoot ? localeHome : links[0]?.href ?? href);
}

/** @param {{ href: string, locale?: string, title: string, languageLinks?: readonly import('../i18n/index.js').LanguageLink[] }} input @returns {Promise<import('./index.js').SiteChrome>} */
export async function getSiteChrome({
  href,
  locale,
  title,
  languageLinks = [],
}) {
  const { getSiteContext, getSiteNavigation } =
    await import("../context/index.js");
  const { getLocaleHref } = await import("../i18n/index.js");
  const { getTaxonomyPaths } = await import("../taxonomies/queries.js");
  const context = getSiteContext();
  locale ??= context.i18n?.defaultLocale ?? context.site.defaults.lang;
  const presentation = resolveSitePresentation(context.site, locale);
  const links = await getSiteNavigation(href, locale);
  const taxonomyGroups =
    presentation.navigation === "grouped"
      ? groupTaxonomyLinks(
          context.taxonomies,
          await getTaxonomyPaths({ locale: context.i18n ? locale : undefined }),
          locale,
        )
      : [];
  const localHref = (path) => getLocaleHref(path, locale);
  const localeHome = localHref("/");
  const homeLink = links.find((link) => canonicalHref(link.href) === canonicalHref(localeHome));
  const homeHref = resolveHomeHref({
    links, localeHome, href,
    ownsRoot: context.plugins.some((plugin) => plugin.rootRoute === true),
  });
  return {
    locale,
    brand: context.site.brand,
    homeHref,
    homeNavigation: homeLink ? { href: homeLink.href, active: homeLink.active } : null,
    languageLinks,
    presentation,
    taxonomyGroups,
    breadcrumbs:
      canonicalHref(href) === canonicalHref(homeHref)
        ? [{ label: title }]
        : [{ label: context.site.brand, href: homeHref }, { label: title }],
    navigation: buildSiteNavigation({
      context,
      links,
      taxonomyGroups,
      href,
      locale,
      presentation,
      localHref,
    }),
  };
}
function canonicalHref(href) {
  return href.replace(/\/$/u, "") || "/";
}
