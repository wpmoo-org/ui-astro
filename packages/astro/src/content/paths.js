import { normalizeSlug } from "../config/index.js";
import { sourceEntryId } from "./index.js";

const canonical = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/u;

export function entryPath(entry, { type, prefix, sourceKind, lang }) {
  const label = `${type} entry ${String(entry?.id)}`;
  if (typeof entry?.id !== "string" || !entry.id) throw new TypeError(`${label} requires a source ID`);
  if (sourceKind === "markdown") sourceEntryId({ entry: entry.id });
  else if (sourceKind !== "json" && sourceKind !== "json-directory") throw new TypeError(`${label} has an unsupported source kind`);
  siteHref(prefix || "/");
  const raw = entry.data?.slug ?? (sourceKind === "markdown" ? entry.id.replace(/\.(?:md|mdx)$/u, "") : entry.id);
  const slug = normalizeSlug(raw, { lang });
  if (slug === "index") throw new TypeError(`${label} uses reserved root index for its archive`);
  return { slug, href: `${prefix}/${slug}`, raw };
}

export function siteHref(localPath, { base = "/", trailingSlash = "ignore" } = {}) {
  if (typeof localPath !== "string" || !canonical.test(localPath)) {
    throw new TypeError(`content path must be canonical: ${String(localPath)}`);
  }
  const mount = typeof base === "string" && base !== "/" ? base.replace(/\/$/u, "") : "";
  if (typeof base !== "string" || !canonical.test(mount || "/")) {
    throw new TypeError(`host base must be canonical: ${String(base)}`);
  }
  if (!["always", "never", "ignore"].includes(trailingSlash)) {
    throw new TypeError(`host trailingSlash is unsupported: ${String(trailingSlash)}`);
  }
  if (localPath === "/") return mount ? trailingSlash === "never" ? mount : `${mount}/` : "/";
  const path = `${mount}${localPath}`;
  return trailingSlash === "always" ? `${path}/` : path;
}
