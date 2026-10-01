import { sourceEntryId } from "../../content/index.js";
import { entryPath, siteHref } from "../../content/paths.js";

const statuses = new Set(["publish", "draft", "pending", "future"]);

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateEntry(entry) {
  if (entry?.collection !== "post") throw new TypeError(`Post entry ${String(entry?.id)} has the wrong collection`);
  sourceEntryId({ entry: entry.id });
  const data = entry.data;
  if (!data || !statuses.has(data.status)) throw new TypeError(`Post entry ${entry.id} has an invalid status`);
  if (typeof data.title !== "string" || !data.title.trim()) throw new TypeError(`Post entry ${entry.id} requires title`);
  if ((data.status === "publish" || data.status === "future" || data.published_at !== undefined) &&
      (!(data.published_at instanceof Date) || !Number.isFinite(data.published_at.getTime()))) {
    throw new TypeError(`Post entry ${entry.id} requires a valid published_at Date`);
  }
  if (data.status === "publish" && data.published_at.getTime() > Date.now()) {
    throw new TypeError(`Post entry ${entry.id} publish status cannot have a future published_at`);
  }
}

function pathOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some(key => key !== "basePath" && key !== "lang")) {
    throw new TypeError("Post path options must contain only basePath and lang");
  }
  const rawBase = options.basePath ?? "/posts";
  const basePath = typeof rawBase === "string" && rawBase !== "/" ? rawBase.replace(/\/$/u, "") : rawBase;
  if (basePath === "/") throw new TypeError("Post basePath must be a nonroot namespace");
  try { siteHref(basePath); } catch (error) {
    throw new TypeError(`Post basePath must be canonical: ${String(basePath)}`, { cause: error });
  }
  return { basePath, lang: options.lang };
}

function postPath(entry, options) {
  return entryPath(entry, { type: "post", prefix: options.basePath, lang: options.lang, sourceKind: "markdown" });
}

export function publishedPostsFromEntries(entries) {
  if (!Array.isArray(entries)) throw new TypeError("Post entries must be an array");
  for (const entry of entries) validateEntry(entry);
  return entries.filter(entry => entry.data.status === "publish").sort((left, right) =>
    right.data.published_at.getTime() - left.data.published_at.getTime() || compareCodepoint(left.id, right.id));
}

export function postHrefFromEntry(entry, options) {
  validateEntry(entry);
  if (entry.data.status !== "publish") throw new TypeError(`Post entry ${entry.id} must be publish to have a public href`);
  return postPath(entry, pathOptions(options)).href;
}

export function postPathsFromEntries(entries, options) {
  const published = publishedPostsFromEntries(entries);
  const normalized = pathOptions(options);
  const paths = new Map();
  const claimed = new Map();
  for (const entry of entries) {
    const path = postPath(entry, normalized);
    paths.set(entry.id, path);
    if (entry.data.status === "publish" || entry.data.status === "future") {
      const previous = claimed.get(path.href);
      if (previous) {
        throw new TypeError(`Post URL collision: post/${previous.id} (${previous.raw}) and post/${entry.id} (${path.raw}) both map to ${path.href}`);
      }
      claimed.set(path.href, { id: entry.id, raw: path.raw });
    }
  }
  return published.map(entry => ({ params: { slug: paths.get(entry.id).slug }, props: { entry } }));
}

export function postLoopItems(entries, { basePath, lang, base, trailingSlash } = {}) {
  if (!Array.isArray(entries)) throw new TypeError("Post Loop entries must be an array");
  return entries.map(entry => ({
    id: entry.id, title: entry.data.title,
    ...(entry.data.description === undefined ? {} : { description: entry.data.description }),
    date: entry.data.published_at,
    href: siteHref(postHrefFromEntry(entry, { basePath, lang }), { base, trailingSlash }),
    entryContext: { type: "post", id: entry.id, source: /** @type {const} */ ("markdown") },
  }));
}
