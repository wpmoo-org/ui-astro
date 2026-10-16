import { normalizeSlug } from "../config/index.js";
import { sourceEntryId } from "./index.js";

import { siteHref } from "../internal/site-href.js";
export { siteHref } from "../internal/site-href.js";

export function entryPath(entry, { type, prefix, sourceKind, lang }) {
  const label = `${type} entry ${String(entry?.id)}`;
  if (typeof entry?.id !== "string" || !entry.id)
    throw new TypeError(`${label} requires a source ID`);
  if (sourceKind === "markdown") sourceEntryId({ entry: entry.id });
  else if (sourceKind !== "json" && sourceKind !== "json-directory")
    throw new TypeError(`${label} has an unsupported source kind`);
  siteHref(prefix || "/");
  const raw =
    entry.data?.slug ??
    (sourceKind === "markdown"
      ? entry.id.replace(/\.(?:md|mdx)$/u, "")
      : entry.id);
  const slug = normalizeSlug(raw, { lang });
  if (slug === "index")
    throw new TypeError(`${label} uses reserved root index for its archive`);
  return { slug, href: `${prefix}/${slug}`, raw };
}
