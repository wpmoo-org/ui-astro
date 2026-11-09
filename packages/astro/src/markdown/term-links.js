// Term links turn the first mention of a named thing (a partner, a school, a
// programme) in Markdown content into a link to its page. Each link is used
// once per document, on the earliest of its terms; headings, code, images,
// HTML and existing links are left alone, a document never links to the
// target it describes itself, and a target the document already links by
// hand is not linked again. An entry may be limited to some documents with
// `include` globs (for example one language folder). It runs as a Sätteri
// mdast plugin (Astro's default Markdown processor) or as a remark plugin
// under `unified()`.
import { fileURLToPath } from "node:url";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

const control = /[\x00-\x1f\x7f]/u;
const skipped = new Set([
  "link",
  "linkReference",
  "heading",
  "code",
  "inlineCode",
  "html",
  "image",
  "imageReference",
  "definition",
  "footnoteDefinition",
  "yaml",
  "toml",
]);
const wordCharacter = /[\p{L}\p{N}_]/u;

function plainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sourcePath(value, root, label) {
  if (value === undefined) return undefined;
  if (value instanceof URL) {
    if (value.protocol !== "file:")
      throw new TypeError(`${label} must be a file URL or path`);
    return normalize(fileURLToPath(value));
  }
  if (typeof value !== "string" || !value.trim() || control.test(value))
    throw new TypeError(`${label} must be a file URL or path`);
  if (isAbsolute(value)) return normalize(value);
  if (!root) throw new TypeError(`${label} must be absolute`);
  return normalize(resolve(fileURLToPath(root), value));
}

// Glob over root-relative paths: `**` spans folders, `*` and `?` stay in one.
function globPattern(pattern, label) {
  if (
    typeof pattern !== "string" ||
    !pattern.trim() ||
    pattern.trim() !== pattern ||
    control.test(pattern) ||
    pattern.startsWith("/") ||
    pattern.includes("\\") ||
    pattern.split("/").includes("..")
  )
    throw new TypeError(`${label} must be a root-relative glob`);
  let source = "";
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      const slash = pattern[index + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
    } else if (character === "*") source += "[^/]*";
    else if (character === "?") source += "[^/]";
    else source += character.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
  }
  return new RegExp(`^${source}$`, "u");
}

/**
 * Validate `moo({ termLinks })` and resolve each `source` to a file path.
 * @param {unknown} input
 * @param {URL} [root] Project root, for relative `source` and `include` paths.
 */
export function normalizeTermLinks(input, root) {
  if (input === undefined) return [];
  if (!Array.isArray(input))
    throw new TypeError("moo.termLinks must be an array");
  const seenTerms = new Set();
  return input.map((link, index) => {
    const label = `moo.termLinks[${index}]`;
    if (!plainRecord(link)) throw new TypeError(`${label} must be an object`);
    for (const key of Object.keys(link))
      if (!["terms", "href", "source", "include"].includes(key))
        throw new TypeError(`${label}.${key} is unsupported`);
    if (!Array.isArray(link.terms) || link.terms.length === 0)
      throw new TypeError(`${label}.terms must list at least one term`);
    const terms = link.terms.map((term, position) => {
      if (
        typeof term !== "string" ||
        term.trim() !== term ||
        !term ||
        control.test(term)
      )
        throw new TypeError(
          `${label}.terms[${position}] must be trimmed plain text`,
        );
      if (seenTerms.has(term))
        throw new TypeError(`${label}.terms[${position}] is a duplicate term`);
      seenTerms.add(term);
      return term;
    });
    const href = link.href;
    if (
      typeof href !== "string" ||
      control.test(href) ||
      !(
        (href.startsWith("/") && !href.startsWith("//")) ||
        href.startsWith("https://")
      )
    )
      throw new TypeError(
        `${label}.href must be a site path or an https address`,
      );
    let include;
    if (link.include !== undefined) {
      if (!Array.isArray(link.include) || link.include.length === 0)
        throw new TypeError(`${label}.include must list at least one glob`);
      if (!root) throw new TypeError(`${label}.include needs the project root`);
      include = link.include.map((pattern, position) =>
        globPattern(pattern, `${label}.include[${position}]`),
      );
    }
    return {
      terms,
      href,
      source: sourcePath(link.source, root, `${label}.source`),
      include,
      root: root ? normalize(fileURLToPath(root)) : undefined,
    };
  });
}

function boundary(text, start, end) {
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";
  return !wordCharacter.test(before) && !wordCharacter.test(after);
}

// Earliest whole-word match among the open links; longer terms win a tie.
function firstMatch(text, open) {
  let best = null;
  for (const link of open) {
    for (const term of link.terms) {
      let from = 0;
      while (from <= text.length - term.length) {
        const start = text.indexOf(term, from);
        if (start < 0) break;
        const end = start + term.length;
        if (boundary(text, start, end)) {
          if (
            !best ||
            start < best.start ||
            (start === best.start && term.length > best.end - best.start)
          )
            best = { start, end, link };
          break;
        }
        from = start + 1;
      }
    }
  }
  return best;
}

function linkText(node, open) {
  const parts = [];
  let rest = node.value;
  for (;;) {
    const match = open.size ? firstMatch(rest, open) : null;
    if (!match) break;
    open.delete(match.link);
    if (match.start > 0)
      parts.push({ type: "text", value: rest.slice(0, match.start) });
    parts.push({
      type: "link",
      url: match.link.href,
      children: [{ type: "text", value: rest.slice(match.start, match.end) }],
    });
    rest = rest.slice(match.end);
  }
  if (!parts.length) return null;
  if (rest) parts.push({ type: "text", value: rest });
  return parts;
}

function walk(parent, open) {
  if (!Array.isArray(parent.children)) return;
  for (let index = 0; index < parent.children.length && open.size; index++) {
    const child = parent.children[index];
    if (skipped.has(child.type)) continue;
    if (child.type === "text") {
      const parts = linkText(child, open);
      if (parts) {
        parent.children.splice(index, 1, ...parts);
        index += parts.length - 1;
      }
      continue;
    }
    walk(child, open);
  }
}

// Comparable form of a link target: no fragment or query, no trailing slash,
// and an absolute address on the site's own origin reduced to its path.
function targetKey(url, origin) {
  let value = String(url).trim();
  if (
    origin &&
    value.startsWith(origin) &&
    /^(?:[/?#]|$)/u.test(value.slice(origin.length))
  )
    value = value.slice(origin.length);
  value = value.split("#")[0].split("?")[0] || "/";
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

// Every link target written in the Markdown source (Sätteri hands plugins the
// unparsed text for such cheap checks): inline links, reference definitions,
// bare and angle-bracket addresses, and raw HTML href attributes.
const linkPatterns = [
  /\]\(\s*<?([^)\s>]+)>?/gu,
  /^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/gmu,
  /\bhttps?:\/\/[^\s<>()"'\]]+/gu,
  /\bhref\s*=\s*["']([^"']+)["']/giu,
];

function linkedTargets(source, origin, found = new Set()) {
  for (const pattern of linkPatterns)
    for (const match of String(source ?? "").matchAll(pattern))
      found.add(
        targetKey(match[1] ?? match[0].replace(/[.,;:!?*_~]+$/u, ""), origin),
      );
  return found;
}

// The remark tree already holds the parsed links; the source may be absent.
function treeTargets(node, origin, found) {
  if ((node.type === "link" || node.type === "definition") && node.url)
    found.add(targetKey(node.url, origin));
  if (Array.isArray(node.children))
    for (const child of node.children) treeTargets(child, origin, found);
  return found;
}

function openLinks(links, { path, linked, origin }) {
  return new Set(
    links.filter((link) => {
      if (link.source && link.source === path) return false;
      if (linked.has(targetKey(link.href, origin))) return false;
      if (!link.include) return true;
      if (!path || !link.root) return false;
      const file = relative(link.root, path).split(sep).join("/");
      if (file.startsWith("../")) return false;
      return link.include.some((pattern) => pattern.test(file));
    }),
  );
}

function siteOrigin(site) {
  if (!site) return undefined;
  try {
    return new URL(String(site)).origin;
  } catch {
    return undefined;
  }
}

/**
 * The Sätteri mdast plugin: a factory called once per document, so each
 * document starts with every link open.
 * @param {ReturnType<typeof normalizeTermLinks>} links
 * @param {{ site?: string | URL }} [options] The site, to recognise absolute links to it.
 */
export function satteriTermLinks(links, options = {}) {
  const origin = siteOrigin(options.site);
  return (document) => {
    const path = document?.fileURL
      ? normalize(fileURLToPath(document.fileURL))
      : undefined;
    const linked = linkedTargets(document?.source, origin);
    const open = openLinks(links, { path, linked, origin });
    if (!open.size) return null;
    return {
      name: "wpmoo-term-links",
      text(node, context) {
        if (!open.size) return;
        for (
          let parent = context.parent(node);
          parent;
          parent = context.parent(parent)
        )
          if (skipped.has(parent.type)) return;
        const parts = linkText(node, open);
        if (parts) context.replaceNode(node, parts);
      },
    };
  };
}

const marker = Symbol.for("wpmoo.termLinks");

/**
 * Add the term links to Astro's configured Markdown processor, replacing an
 * earlier copy when the config hook runs again.
 * @param {{ name?: string, options?: Record<string, unknown> } | undefined} processor
 * @param {ReturnType<typeof normalizeTermLinks>} links
 * @param {{ site?: string | URL }} [options]
 */
export function addTermLinks(processor, links, options = {}) {
  const list =
    processor?.name === "satteri"
      ? processor.options?.mdastPlugins
      : processor?.name === "unified"
        ? processor.options?.remarkPlugins
        : undefined;
  if (!Array.isArray(list))
    throw new TypeError(
      "moo.termLinks needs the satteri or unified Markdown processor",
    );
  for (let index = list.length - 1; index >= 0; index--)
    if (list[index]?.[marker] || list[index]?.[0]?.[marker])
      list.splice(index, 1);
  const entry =
    processor.name === "satteri"
      ? satteriTermLinks(links, options)
      : [remarkTermLinks, { links, site: options.site }];
  if (processor.name === "satteri") entry[marker] = true;
  else entry[0] = Object.assign((options) => remarkTermLinks(options), { [marker]: true });
  list.push(entry);
}

/**
 * The remark plugin; `links` come from `normalizeTermLinks`.
 * @param {{ links: ReturnType<typeof normalizeTermLinks>, site?: string | URL }} options
 */
export function remarkTermLinks({ links, site }) {
  const origin = siteOrigin(site);
  return (tree, file) => {
    const path = file?.path ? normalize(String(file.path)) : undefined;
    const linked = treeTargets(tree, origin, linkedTargets(file?.value, origin));
    const open = openLinks(links, { path, linked, origin });
    if (open.size) walk(tree, open);
  };
}
