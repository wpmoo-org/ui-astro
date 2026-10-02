import { normalizeSlug } from "../config/index.js";
import { siteHref } from "../content/paths.js";
import { termSchema } from "./content.js";

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function taxonomyMount(value = "/topics") {
  const path = typeof value === "string" && value !== "/" ? value.replace(/\/$/u, "") : value;
  try {
    siteHref(path);
    if (path === "/" || ["404", "_astro", "_server_islands", "_actions", "__moo_content_integrity"].includes(path.split("/")[1])) throw new Error();
  } catch {
    throw new TypeError(`moo.taxonomyBasePath must be a canonical nonroot namespace: ${String(value)}`);
  }
  return path;
}

export function validateTerms(taxonomy, entries, { lang = "en" } = {}) {
  if (!Array.isArray(entries)) throw new TypeError(`${taxonomy.id} terms must be native collection entries`);
  const terms = new Map();
  const slugs = new Map();
  for (const entry of entries) {
    if (entry?.collection !== taxonomy.id) throw new TypeError(`${taxonomy.id} term has the wrong collection`);
    const parsed = termSchema.safeParse(entry.data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new TypeError(`${taxonomy.id} term ${entry.id} fails schema at ${issue.path.join(".")}: ${issue.message}`);
    }
    const term = Object.freeze(parsed.data);
    if (entry.id !== term.id) throw new TypeError(`${taxonomy.id} term ${entry.id} differs from its data id ${term.id}`);
    if (terms.has(term.id)) throw new TypeError(`${taxonomy.id} has duplicate term ID ${term.id}`);
    terms.set(term.id, term);
    const slug = normalizeSlug(term.slug, { lang });
    const previous = slugs.get(slug);
    if (previous) throw new TypeError(`${taxonomy.id} term URL collision: ${previous.id} (${previous.slug}) and ${term.id} (${term.slug}) both map to ${slug}`);
    slugs.set(slug, term);
    if (term.parent && !taxonomy.hierarchical) throw new TypeError(`${taxonomy.id} term ${term.id} parent is forbidden for a flat taxonomy`);
  }
  for (const term of terms.values()) {
    if (term.parent === term.id) throw new TypeError(`${taxonomy.id} term ${term.id} parent cannot be itself`);
    if (term.parent && !terms.has(term.parent)) throw new TypeError(`${taxonomy.id} term ${term.id} has unknown parent ${term.parent}`);
  }
  const visited = new Set();
  for (const id of terms.keys()) {
    const chain = new Set();
    let current = id;
    while (current && !visited.has(current)) {
      if (chain.has(current)) throw new TypeError(`${taxonomy.id} parent cycle: ${[...chain, current].join(" -> ")}`);
      chain.add(current);
      current = terms.get(current).parent;
    }
    for (const member of chain) visited.add(member);
  }
  return new Map([...terms].sort(([left], [right]) => compare(left, right)));
}

function memberships(entry) {
  const value = entry.data?.taxonomies;
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${entry.collection} ${entry.id} taxonomies must be a record`);
  return Object.fromEntries(Object.entries(value).map(([taxonomy, refs]) => {
    const label = `${entry.collection} ${entry.id} taxonomies.${taxonomy}`;
    if (!Array.isArray(refs)) throw new TypeError(`${label} must be an array`);
    const ids = new Set();
    for (const ref of refs) {
      if (!ref || typeof ref !== "object" || Array.isArray(ref) ||
          typeof ref.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(ref.id) ||
          Object.keys(ref).some(key => key !== "id" && key !== "collection")) {
        throw new TypeError(`${label} needs a native reference with collection and stable id`);
      }
      if (ref.collection !== taxonomy) throw new TypeError(`${label} has the wrong reference collection ${String(ref.collection)}`);
      if (ids.has(ref.id)) throw new TypeError(`${label} has duplicate term ${ref.id}`);
      ids.add(ref.id);
    }
    return [taxonomy, Object.freeze([...ids].sort(compare))];
  }));
}

export function validateReferences(type, entries, termGraphs) {
  for (const entry of entries) {
    for (const [taxonomy, ids] of Object.entries(memberships(entry))) {
      if (!type.taxonomies.includes(taxonomy)) throw new TypeError(`${type.id} ${entry.id} has unbound taxonomy ${taxonomy}`);
      const terms = termGraphs.get(taxonomy);
      if (!terms) throw new TypeError(`${type.id} ${entry.id} has inactive taxonomy ${taxonomy}`);
      for (const id of ids) {
        if (!terms.has(id)) throw new TypeError(`${type.id} ${entry.id} taxonomies.${taxonomy} references missing term ${id}`);
      }
    }
  }
}

/** @returns {import("../config/index.js").EntryClassContext} */
export function entryClassContext(type, entry) {
  const taxonomies = memberships(entry);
  return Object.freeze({
    type: type.id, id: entry.id, source: type.sourceKind === "markdown" ? "markdown" : "json",
    ...(entry.data?.taxonomies === undefined ? {} : { taxonomies: Object.freeze(taxonomies) }),
  });
}

export function termHref(taxonomy, term, { lang = "en", taxonomyBasePath = "/topics", base, trailingSlash } = {}) {
  return siteHref(`${taxonomyMount(taxonomyBasePath)}/${taxonomy.id}/${normalizeSlug(term.slug, { lang })}`, { base, trailingSlash });
}

export function termItems(taxonomy, terms, termId, sources, { include = "direct", getEntryHref } = {}) {
  if (!terms.has(termId)) throw new TypeError(`${taxonomy.id} ${String(termId)} is an unknown term`);
  if (include !== "direct" && include !== "descendants") throw new TypeError("Term include must be direct or descendants");
  if (include === "descendants" && !taxonomy.hierarchical) throw new TypeError("Term descendants requires a hierarchical taxonomy");
  const selected = new Set([termId]);
  if (include === "descendants") {
    const children = new Map();
    for (const term of terms.values()) {
      if (!children.has(term.parent)) children.set(term.parent, []);
      children.get(term.parent).push(term.id);
    }
    const pending = [termId];
    while (pending.length) {
      for (const child of children.get(pending.pop()) ?? []) { selected.add(child); pending.push(child); }
    }
  }
  const items = [];
  for (const { type, entries } of sources) {
    for (const entry of entries) {
      if (entry.data.status !== "publish") continue;
      const entryContext = entryClassContext(type, entry);
      if (!entryContext.taxonomies?.[taxonomy.id]?.some(id => selected.has(id))) continue;
      const date = entry.data.published_at;
      if (date !== undefined && (!(date instanceof Date) || !Number.isFinite(date.getTime()))) throw new TypeError(`${type.id} ${entry.id} published_at must be a valid Date`);
      items.push(Object.freeze({
        id: `${type.id}:${entry.id}`, type: type.id, entryId: entry.id,
        title: entry.data.title, href: getEntryHref(type.id, entry), entryContext,
        ...(entry.data.description === undefined ? {} : { description: entry.data.description }),
        ...(date === undefined ? {} : { date: new Date(date.getTime()) }),
      }));
    }
  }
  items.sort((left, right) => compare(left.type, right.type) || compare(left.entryId, right.entryId));
  return Object.freeze(items);
}
