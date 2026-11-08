// Term links turn the first mention of a named thing (a partner, a school, a
// programme) in Markdown content into a link to its page. Each link is used
// once per document, on the earliest of its terms; headings, code, images,
// HTML and existing links are left alone, and a document never links to the
// target it describes itself. It runs as a Sätteri mdast plugin (Astro's
// default Markdown processor) or as a remark plugin under `unified()`.
import { fileURLToPath } from "node:url";
import { isAbsolute, normalize, resolve } from "node:path";

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

/**
 * Validate `moo({ termLinks })` and resolve each `source` to a file path.
 * @param {unknown} input
 * @param {URL} [root] Project root, for relative `source` paths.
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
      if (!["terms", "href", "source"].includes(key))
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
    return {
      terms,
      href,
      source: sourcePath(link.source, root, `${label}.source`),
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

function openLinks(links, path) {
  return new Set(links.filter((link) => !link.source || link.source !== path));
}

/**
 * The Sätteri mdast plugin: a factory called once per document, so each
 * document starts with every link open.
 * @param {ReturnType<typeof normalizeTermLinks>} links
 */
export function satteriTermLinks(links) {
  return (document) => {
    const path = document?.fileURL
      ? normalize(fileURLToPath(document.fileURL))
      : undefined;
    const open = openLinks(links, path);
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
 */
export function addTermLinks(processor, links) {
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
      ? satteriTermLinks(links)
      : [remarkTermLinks, { links }];
  if (processor.name === "satteri") entry[marker] = true;
  else entry[0] = Object.assign((options) => remarkTermLinks(options), { [marker]: true });
  list.push(entry);
}

/**
 * The remark plugin; `links` come from `normalizeTermLinks`.
 * @param {{ links: ReturnType<typeof normalizeTermLinks> }} options
 */
export function remarkTermLinks({ links }) {
  return (tree, file) => {
    const path = file?.path ? normalize(String(file.path)) : undefined;
    const open = openLinks(links, path);
    if (open.size) walk(tree, open);
  };
}
