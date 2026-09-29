import { siteHref } from "../content/paths.js";
import { pagePathsFromEntries } from "../plugins/page/paths.js";

const currentPathPattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?\/?$/u;

function normalizedPath(path) {
  if (typeof path !== "string" || !currentPathPattern.test(path) || path.startsWith("//")) {
    throw new TypeError(`currentPath must be a canonical URL pathname: ${String(path)}`);
  }
  return path.replace(/\/$/u, "") || "/";
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
