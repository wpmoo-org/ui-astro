// sitemap.xml and robots.txt, written at astro:build:done from the built
// pages themselves. A page is listed when its <link rel="canonical"> is its
// own address under the Astro `site` (base and trailingSlash included) and it
// has no robots noindex. The head is rendered from resolveSeoMetadata() and
// getLanguageLinks(), so the head and the sitemap cannot diverge:
// - loc is the canonical,
// - alternates are its <link rel="alternate" hreflang> links,
// - lastmod is its JSON-LD dateModified, else datePublished, as given.
//   No recorded date means no lastmod; build time is never used.
// Nothing here depends on Astro, so tests and read-only parity checks can run
// it on any built directory.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** URLs per sitemap file (sitemaps.org protocol limit). */
export const SITEMAP_URL_LIMIT = 50_000;

const sitemapNamespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
const xhtmlNamespace = "http://www.w3.org/1999/xhtml";
const optOut = {
  sitemap: "moo({ site: { seo: { sitemap: false } } })",
  robots: "moo({ site: { seo: { robots: false } } })",
};
// The root error pages and the SDK's own (localized) error routes are never
// listed, whatever their head says.
const rootErrorPages = ["404", "500"];
const localPath = (path) => String(path ?? "").replace(/^\/+|\/+$/gu, "");
// W3C Datetime (https://www.w3.org/TR/NOTE-datetime): YYYY, YYYY-MM,
// YYYY-MM-DD, or a date with hh:mm[:ss[.s]] and a zone (Z or +hh:mm).
const w3cPattern =
  /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2})))?)?)?$/u;

/** Whether value is a real W3C Datetime (valid month, day, time and zone). */
export function isW3cDate(value) {
  const match = w3cPattern.exec(String(value ?? ""));
  if (!match) return false;
  const [, year, month, day, hour, minute, second, , zoneHour, zoneMinute] = match;
  if (month !== undefined && (Number(month) < 1 || Number(month) > 12)) return false;
  if (day !== undefined) {
    const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    if (Number(day) < 1 || Number(day) > last) return false;
  }
  if (hour !== undefined && (Number(hour) > 23 || Number(minute) > 59)) return false;
  if (second !== undefined && Number(second) > 59) return false;
  if (zoneHour !== undefined && (Number(zoneHour) > 23 || Number(zoneMinute) > 59)) return false;
  return true;
}

/** The outputs that site.seo turns on; both default to on. */
export function resolveSeoOutputs(seo) {
  const robots = seo?.robots ?? true;
  return {
    sitemap: seo?.sitemap !== false,
    robots: robots !== false,
    disallow: typeof robots === "object" ? [...(robots.disallow ?? [])] : [],
  };
}

function mountOf(base) {
  const trimmed = String(base ?? "/").replace(/^\/+|\/+$/gu, "");
  return trimmed ? `/${trimmed}` : "";
}

/** Absolute URL of a file the SDK writes at the root of the build output. */
export function outputUrl(name, { site, base }) {
  return new URL(`${mountOf(base)}/${name}`, site).href;
}

/**
 * The file a host-root path (route pattern or public file) would collide
 * with, or null. Paths may carry the base; it is ignored.
 */
export function reservedOutput(path, outputs, base) {
  let local = String(path ?? "");
  const mount = mountOf(base);
  if (mount && local.startsWith(`${mount}/`)) local = local.slice(mount.length);
  local = local.replace(/^\/+/u, "");
  if (outputs.robots && local === "robots.txt") return "robots.txt";
  if (outputs.sitemap && /^sitemap(?:-\d+)?\.xml$/u.test(local)) return local;
  return null;
}

/** The error message for a collision with an SDK output. */
export function collisionMessage(file, source) {
  const key = file === "robots.txt" ? "robots" : "sitemap";
  return `@wpmoo/astro writes ${file} at build, and ${source} also provides it. Nothing is overwritten: remove the other ${file}, or turn the SDK output off with ${optOut[key]}.`;
}

/** The error message for a sitemap build without the Astro site. */
export function missingSiteMessage() {
  return `@wpmoo/astro writes sitemap.xml at build and needs the Astro \`site\` (the production URL) in astro.config.mjs. Set \`site\`, or turn the sitemap off with ${optOut.sitemap}.`;
}

/** Another integration that likely writes the same file after or before ours. */
export function competingIntegrations(integrations, outputs) {
  const found = [];
  for (const integration of integrations ?? []) {
    const name = String(integration?.name ?? "");
    if (name === "@wpmoo/astro") continue;
    if (outputs.sitemap && /sitemap/iu.test(name))
      found.push({ name, file: "sitemap.xml" });
    else if (outputs.robots && /robots/iu.test(name))
      found.push({ name, file: "robots.txt" });
  }
  return found;
}

// ---------------------------------------------------------------- head parse

const namedEntities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, code) => {
    if (code[0] === "#") {
      const value =
        code[1] === "x" || code[1] === "X"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isInteger(value) && value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : match;
    }
    return namedEntities[code.toLowerCase()] ?? match;
  });
}

/**
 * Attributes of one start tag, in any order and quoting; first one wins.
 * As in HTML, an unquoted value runs until whitespace or ">", so a "/"
 * before ">" belongs to it; elsewhere a "/" is only the self-closing mark.
 */
export function parseAttributes(tag) {
  const body = tag.replace(/^<[^\s>/]+/u, "").replace(/>$/u, "");
  const attributes = {};
  const pattern =
    /([^\s"'=<>/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of body.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    if (Object.hasOwn(attributes, name)) continue;
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

const tokens = (value, separator = /\s+/u) =>
  String(value ?? "")
    .toLowerCase()
    .split(separator)
    .map((token) => token.trim())
    .filter(Boolean);

// One pass over the document: comments and the contents of title, script,
// style, template, textarea and noscript are skipped as units, so markup
// inside them is never read as a tag (JSON-LD script bodies are kept as
// data). link and meta tags count only inside the head; JSON-LD anywhere.
const scanner =
  /<!--[\s\S]*?-->|<(script|style|title|template|textarea|noscript)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>|<\/head\s*>|<body\b|<(link|meta)\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu;

/**
 * Canonical links, hreflang alternates, robots noindex and JSON-LD dates of
 * one built HTML document.
 */
export function parseHead(html) {
  const canonicals = [];
  const alternates = [];
  const jsonLd = [];
  let noindex = false;
  let inHead = true;
  for (const match of String(html).matchAll(scanner)) {
    const [whole, rawBlock, blockAttributes, blockBody, voidTag] = match;
    if (whole.startsWith("<!--")) continue;
    if (rawBlock) {
      if (
        rawBlock.toLowerCase() === "script" &&
        parseAttributes(`<script${blockAttributes}>`).type?.trim().toLowerCase() ===
          "application/ld+json"
      )
        jsonLd.push(blockBody);
      continue;
    }
    if (!voidTag) {
      inHead = false;
      continue;
    }
    if (!inHead) continue;
    const attributes = parseAttributes(whole);
    if (voidTag.toLowerCase() === "link") {
      const rel = tokens(attributes.rel);
      const href = attributes.href?.trim();
      if (!href) continue;
      if (rel.includes("canonical")) canonicals.push(href);
      if (rel.includes("alternate") && attributes.hreflang?.trim())
        alternates.push({ hreflang: attributes.hreflang.trim(), href });
    } else if (tokens(attributes.name).includes("robots")) {
      const content = tokens(attributes.content, /[\s,]+/u);
      if (content.includes("noindex") || content.includes("none")) noindex = true;
    }
  }
  const things = [];
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      things.push(value);
      if (value["@graph"]) collect(value["@graph"]);
    }
  };
  for (const block of jsonLd) {
    try {
      collect(JSON.parse(block));
    } catch {
      // Invalid JSON-LD carries no date for the sitemap.
    }
  }
  const dates = things
    .map((thing) => ({
      url: typeof thing.url === "string" ? thing.url : undefined,
      id: typeof thing["@id"] === "string" ? thing["@id"] : undefined,
      modified: typeof thing.dateModified === "string" ? thing.dateModified.trim() : undefined,
      published:
        typeof thing.datePublished === "string" ? thing.datePublished.trim() : undefined,
    }))
    .filter((thing) => thing.modified || thing.published);
  return { canonicals, alternates, noindex, dates };
}

// ------------------------------------------------------------------- listing

function absolute(href, from) {
  try {
    const url = new URL(href, from);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The addresses a built page is served at under site, base and
 * trailingSlash. With "ignore" both slash forms count as the page itself.
 */
export function selfUrls(pathname, { site, base = "/", trailingSlash = "ignore" }) {
  const mount = mountOf(base);
  const local = String(pathname ?? "").replace(/^\/+|\/+$/gu, "");
  const bare = local ? `${mount}/${local}` : mount;
  const slash = `${bare}/`;
  const plain = bare || "/";
  const forms =
    trailingSlash === "always" ? [slash] : trailingSlash === "never" ? [plain] : [plain, slash];
  return [...new Set(forms.map((path) => new URL(path, site).href))];
}

function htmlFile(root, pathname) {
  const local = String(pathname ?? "").replace(/^\/+|\/+$/gu, "");
  // Astro names a page "a/" for a/index.html (directory format) and "a" for
  // a.html (file format); try that form first, then the other.
  const directory = String(pathname ?? "").endsWith("/");
  const candidates = local
    ? [
        ...(local.endsWith(".html") ? [local] : []),
        ...(directory
          ? [`${local}/index.html`, `${local}.html`]
          : [`${local}.html`, `${local}/index.html`]),
      ]
    : ["index.html"];
  for (const candidate of candidates) {
    const file = join(root, ...candidate.split("/"));
    if (existsSync(file) && statSync(file).isFile()) return { file, relative: candidate };
  }
  return null;
}

// Only a JSON-LD object about this page dates it: its url, or its @id
// without the fragment, is the canonical. Dates of other objects (another
// article, an event) are never used.
function lastmodOf(head, loc, warn, relative) {
  const about = (value) => {
    const url = value && absolute(value, loc);
    return url ? url.replace(/#.*$/u, "") === loc : false;
  };
  const own = head.dates.find((thing) => about(thing.url) || (!thing.url && about(thing.id)));
  if (!own) return undefined;
  const value = own.modified ?? own.published;
  if (isW3cDate(value)) return value;
  warn?.(`sitemap: ${relative} has a JSON-LD date that is not a W3C date (${value}); no lastmod written`);
  return undefined;
}

/**
 * Scan the built pages and return the sitemap entries, sorted by loc.
 * Throws when the guard fails: alternates must be listed URLs, canonicals
 * must be unique, and every URL must be absolute under site.
 */
export function collectSitemapEntries({ dir, pages, site, base = "/", trailingSlash = "ignore", errorPaths = [], warn }) {
  if (!site) throw new TypeError(missingSiteMessage());
  const root = dir instanceof URL ? fileURLToPath(dir) : String(dir);
  const siteUrl = new URL(site);
  const mount = mountOf(base);
  const entries = [];
  const owners = new Map();
  const errorPages = new Set([...rootErrorPages, ...errorPaths.map(localPath)]);
  // Pages left out, with the reason, so the build log can name them.
  const left = [];
  for (const { pathname } of pages) {
    const local = String(pathname ?? "").replace(/^\/+|\/+$/gu, "");
    const path = `/${local}`;
    if (errorPages.has(local)) {
      left.push({ path, reason: "error page" });
      continue;
    }
    const found = htmlFile(root, pathname);
    if (!found) {
      left.push({ path, reason: "no HTML file" });
      continue;
    }
    const selves = selfUrls(pathname, { site, base, trailingSlash });
    const head = parseHead(readFileSync(found.file, "utf8"));
    const canonicals = [...new Set(head.canonicals.map((href) => absolute(href, selves[0])))];
    if (canonicals.length > 1)
      throw new Error(
        `sitemap: ${found.relative} has ${canonicals.length} different canonical links (${canonicals.join(", ")}); a page names one canonical.`,
      );
    const loc = canonicals[0];
    const reason = head.noindex
      ? "noindex"
      : !loc
        ? "no canonical"
        : !selves.includes(loc)
          ? "canonical is another URL"
          : null;
    if (reason) {
      left.push({ path, reason });
      continue;
    }
    const seen = new Set();
    const alternates = [];
    for (const { hreflang, href } of head.alternates) {
      const url = absolute(href, loc) ?? href;
      const key = `${hreflang}\n${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      alternates.push({ hreflang, href: url });
    }
    const lastmod = lastmodOf(head, loc, warn, found.relative);
    if (owners.has(loc))
      throw new Error(
        `sitemap: ${owners.get(loc)} and ${found.relative} both name ${loc} as their canonical; canonicals must be unique.`,
      );
    owners.set(loc, found.relative);
    entries.push({ loc, ...(lastmod ? { lastmod } : {}), alternates });
  }
  const outside = entries
    .map((entry) => entry.loc)
    .filter((loc) => {
      const url = new URL(loc);
      return (
        url.origin !== siteUrl.origin ||
        (mount && url.pathname !== mount && !url.pathname.startsWith(`${mount}/`))
      );
    });
  if (outside.length)
    throw new Error(`sitemap: URLs that are not under ${new URL(`${mount}/`, site).href}:\n${outside.join("\n")}`);
  const broken = entries.flatMap((entry) =>
    entry.alternates
      .filter(({ href }) => !owners.has(href))
      .map(({ hreflang, href }) => `${entry.loc} → ${href} (${hreflang})`),
  );
  if (broken.length)
    throw new Error(
      `sitemap: language alternates that are not listed pages (missing, redirected, noindex or not self-canonical):\n${broken.join("\n")}`,
    );
  entries.sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0));
  return { entries, left, skipped: left.length };
}

// ----------------------------------------------------------------- rendering

export function escapeXml(text) {
  return String(text)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function urlset(entries) {
  const alternates = entries.some((entry) => entry.alternates.length);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${sitemapNamespace}"${alternates ? ` xmlns:xhtml="${xhtmlNamespace}"` : ""}>`,
    ...entries.map((entry) =>
      [
        `<url><loc>${escapeXml(entry.loc)}</loc>`,
        entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "",
        ...entry.alternates.map(
          ({ hreflang, href }) =>
            `<xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(href)}"/>`,
        ),
        "</url>",
      ].join(""),
    ),
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * The sitemap files for the entries: one `sitemap.xml` urlset, or above the
 * limit a `sitemap.xml` index of `sitemap-1.xml`, `sitemap-2.xml`, ...
 */
export function renderSitemapFiles(entries, { site, base = "/", limit = SITEMAP_URL_LIMIT }) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("sitemap limit must be a positive integer");
  if (entries.length <= limit) return [{ name: "sitemap.xml", content: urlset(entries) }];
  const files = [];
  for (let start = 0; start < entries.length; start += limit)
    files.push({
      name: `sitemap-${files.length + 1}.xml`,
      content: urlset(entries.slice(start, start + limit)),
    });
  const index = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<sitemapindex xmlns="${sitemapNamespace}">`,
    ...files.map(({ name }) => `<sitemap><loc>${escapeXml(outputUrl(name, { site, base }))}</loc></sitemap>`),
    "</sitemapindex>",
    "",
  ].join("\n");
  return [{ name: "sitemap.xml", content: index }, ...files];
}

/**
 * Build-log lines for the pages left out: one summary by reason, a warning
 * when the home page is not listed, and every path for verbose logs.
 */
export function leftOutReport(left) {
  const counts = new Map();
  for (const { reason } of left) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const summary = [...counts].map(([reason, count]) => `${count} ${reason}`).join(", ");
  const home = left.find((item) => item.path === "/");
  return {
    summary,
    warning: home ? `sitemap: the home page / is not listed (${home.reason})` : null,
    details: left.map(({ path, reason }) => `sitemap: left out ${path} (${reason})`),
  };
}

/** robots.txt: everything allowed, optional Disallow lines, the sitemap. */
export function renderRobots({ sitemapUrl, disallow = [] } = {}) {
  return [
    "User-agent: *",
    "Allow: /",
    ...disallow.map((path) => `Disallow: ${path}`),
    ...(sitemapUrl ? ["", `Sitemap: ${sitemapUrl}`] : []),
    "",
  ].join("\n");
}

/**
 * Build the outputs and write them into dir. Fails, writing nothing, when
 * any of the files is already there.
 */
export function writeSeoOutputs({ dir, pages, site, base = "/", trailingSlash = "ignore", errorPaths, outputs, limit, warn }) {
  const root = dir instanceof URL ? fileURLToPath(dir) : String(dir);
  const files = [];
  let listed = null;
  if (outputs.sitemap) {
    listed = collectSitemapEntries({ dir: root, pages, site, base, trailingSlash, errorPaths, warn });
    files.push(...renderSitemapFiles(listed.entries, { site, base, limit }));
  }
  if (outputs.robots)
    files.push({
      name: "robots.txt",
      content: renderRobots({
        sitemapUrl: outputs.sitemap ? outputUrl("sitemap.xml", { site, base }) : undefined,
        disallow: outputs.disallow,
      }),
    });
  for (const { name } of files)
    if (existsSync(join(root, name)))
      throw new Error(collisionMessage(name, `the build output (a public/ file, a host route or another integration)`));
  for (const { name, content } of files) {
    try {
      writeFileSync(join(root, name), content, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error(collisionMessage(name, "the build output"));
      throw error;
    }
  }
  return {
    files: files.map((file) => file.name),
    entries: listed?.entries ?? [],
    left: listed?.left ?? [],
    skipped: listed?.skipped ?? 0,
  };
}
