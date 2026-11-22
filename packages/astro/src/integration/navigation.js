import { siteHref } from "../content/paths.js";
import { pagePathsFromEntries } from "../plugins/page/paths.js";

const currentPathPattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?\/?$/u;

function normalizedPath(path) {
  if (typeof path !== "string" || !currentPathPattern.test(path) || path.startsWith("//")) {
    throw new TypeError(`currentPath must be a canonical URL pathname: ${String(path)}`);
  }
  return path.replace(/\/$/u, "") || "/";
}

export function navigationFromDescriptors(items, currentPath, options) {
  const current = normalizedPath(currentPath);
  return Object.freeze(items.map(item => {
    const href = siteHref(item.path, options);
    const path = normalizedPath(href);
    return Object.freeze({
      label: item.label, href,
      active: current === path || (item.match === "prefix" && current.startsWith(`${path}/`)),
    });
  }));
}

// Items without an order keep their incoming sequence after ordered ones;
// Array.prototype.sort is stable.
export function sortNavigation(items, orders) {
  return items
    .map((item, index) => ({ item, order: orders[index] ?? Number.MAX_SAFE_INTEGER, index }))
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ item }) => item);
}

export function pageNavigationOrders(entries, options) {
  const { lang, reservedPrefixes } = options;
  return pagePathsFromEntries(entries, { lang, reservedPrefixes }).map(
    ({ props }) => props.entry.data.navOrder,
  );
}

export function navigationFromPages(entries, currentPath, options) {
  const current = normalizedPath(currentPath);
  const { lang, reservedPrefixes, base, trailingSlash } = options;
  return Object.freeze(pagePathsFromEntries(entries, { lang, reservedPrefixes }).map(({ params, props }) => {
    const href = siteHref(params.slug ? `/${params.slug}` : "/", { base, trailingSlash });
    return Object.freeze({
      label: props.entry.data.navLabel ?? props.entry.data.title,
      href,
      active: normalizedPath(href) === current,
    });
  }));
}
