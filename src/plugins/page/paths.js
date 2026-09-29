import { normalizeSlug } from "../../config/index.js";
import { sourceEntryId } from "../../content/index.js";

const reservedRoots = new Set(["404", "_astro", "_server_islands", "_actions", "__moo_content_integrity"]);
const canonicalPath = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/u;
const publicStates = new Set(["publish", "future"]);

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function prefixes(options) {
  if (options === undefined) return [];
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some((key) => key !== "lang" && key !== "reservedPrefixes")) {
    throw new TypeError("Page path options must contain only lang and reservedPrefixes");
  }
  const values = options.reservedPrefixes ?? [];
  if (!Array.isArray(values)) throw new TypeError("Page reservedPrefixes must be an array");
  for (const value of values) {
    if (typeof value !== "string" || value === "/" || !canonicalPath.test(value)) {
      throw new TypeError(`Page reservedPrefixes must contain canonical paths: ${String(value)}`);
    }
  }
  return values;
}

function pagePath(entry, options, mounts) {
  if (entry?.collection !== "page") throw new TypeError(`Page entry ${String(entry?.id)} has the wrong collection`);
  sourceEntryId({ entry: entry.id });
  const raw = entry.data?.slug ?? entry.id.replace(/\.(?:md|mdx)$/u, "");
  if (typeof raw !== "string") throw new TypeError(`Page entry ${entry.id} slug must be text`);
  const rawRoot = raw.split("/")[0].toLowerCase();
  if (reservedRoots.has(rawRoot)) throw new TypeError(`Page entry ${entry.id} uses reserved namespace ${rawRoot}`);
  const canonical = normalizeSlug(raw, { lang: options?.lang });
  const parts = canonical.split("/");
  if (parts.at(-1) === "index") parts.pop();
  const slug = parts.join("/");
  const href = slug ? `/${slug}` : "/";
  const root = parts[0];
  if (reservedRoots.has(root)) throw new TypeError(`Page entry ${entry.id} uses reserved namespace ${href}`);
  for (const mount of mounts) {
    if (href === mount || href.startsWith(`${mount}/`)) {
      throw new TypeError(`Page entry ${entry.id} maps to ${href} inside reserved namespace ${mount}`);
    }
  }
  return { slug: slug || undefined, href, raw };
}

export function pagePathsFromEntries(entries, options) {
  if (!Array.isArray(entries)) throw new TypeError("Page entries must be an array");
  const mounts = prefixes(options);
  const claimed = new Map();
  const publicEntries = [];
  for (const entry of entries) {
    const path = pagePath(entry, options, mounts);
    const status = entry.data?.status;
    if (!["publish", "draft", "pending", "future"].includes(status)) {
      throw new TypeError(`Page entry ${entry.id} has an invalid status`);
    }
    if (publicStates.has(status)) {
      const previous = claimed.get(path.href);
      if (previous) {
        throw new TypeError(`Page URL collision: page/${previous.id} (${previous.raw}) and page/${entry.id} (${path.raw}) both map to ${path.href}`);
      }
      claimed.set(path.href, { id: entry.id, raw: path.raw });
    }
    if (status === "publish") publicEntries.push({ entry, path });
  }
  publicEntries.sort((left, right) =>
    (left.entry.data.navOrder ?? Number.MAX_SAFE_INTEGER) - (right.entry.data.navOrder ?? Number.MAX_SAFE_INTEGER) ||
    compareCodepoint(left.entry.id, right.entry.id));
  return publicEntries.map(({ entry, path }) => ({ params: { slug: path.slug }, props: { entry } }));
}
