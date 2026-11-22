// The HTML sitemap page (/sitemap/ per locale) and sitemap.xsl, both filled
// at astro:build:done from the same scan that writes sitemap.xml.
//
// The page renders at build with the real Typography and Table components
// and ONE template group (heading and table) whose ONE row holds the ASCII
// sentinel tokens below. The fill clones that rendered markup per group and
// per row and replaces only the tokens, with escaped values, so Table is
// never re-implemented here. A missing template fails the build.
// Nothing here depends on Astro.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { htmlFile, parseAttributes, parseHead, pageTitleOf } from "./sitemap.js";

const tokenNames = Object.freeze({
  total: "TOTAL",
  groupId: "GROUP_ID",
  groupLabel: "GROUP_LABEL",
  groupCount: "GROUP_COUNT",
  href: "HREF",
  title: "TITLE",
  description: "DESCRIPTION",
  date: "DATE",
  dateTime: "DATETIME",
});
const optOut = "moo({ site: { seo: { htmlSitemap: false } } })";
// What to do about a broken page: the SDK page is restored; a host page
// (sitemap.routeOwner "host") places SitemapContent once.
const remedies = Object.freeze({
  plugin: "Restore the SDK page",
  host: `The host page (sitemap.routeOwner "host") must place SitemapContent from @wpmoo/astro/blocks/SitemapContent.astro exactly once`,
});

/**
 * The tokens the page renders in its template for one build. The nonce is
 * random per build, so ordinary content never matches a token; Astro passes
 * the ASCII tokens unchanged in text and attributes.
 */
export function sitemapTokens(nonce) {
  if (!/^[A-Za-z0-9]{8,64}$/u.test(String(nonce ?? "")))
    throw new TypeError("sitemap token nonce must be 8-64 ASCII letters or digits");
  return Object.freeze(
    Object.fromEntries(
      Object.entries(tokenNames).map(([key, name]) => [key, `MOO_SITEMAP_${nonce}_${name}_`]),
    ),
  );
}

/** The shown date: YYYY-MM-DD of a lastmod with a day, else the lastmod. */
export function displayDate(lastmod) {
  const value = String(lastmod ?? "");
  return /^\d{4}-\d{2}-\d{2}/u.test(value) ? value.slice(0, 10) : value;
}

/** HTML text and attribute escaping of & < > " '. */
export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

// The template is split at its tokens once, before any value goes in; a
// fill joins the static parts with escaped values and never scans a value.
function splitTokens(fragment, tokens, allowed, source, what, routeOwner) {
  const byToken = new Map(Object.entries(tokens).map(([key, token]) => [token, key]));
  const prefix = tokens.total.slice(0, tokens.total.length - "TOTAL_".length);
  const parts = [];
  let rest = fragment;
  for (;;) {
    const at = rest.indexOf(prefix);
    if (at < 0) break;
    const token = [...byToken.keys()].find((value) => rest.startsWith(value, at));
    const key = token && byToken.get(token);
    if (!key || !allowed.includes(key)) throw templateError(source, `well-formed ${what} (unexpected token there)`, routeOwner);
    parts.push(rest.slice(0, at), key);
    rest = rest.slice(at + token.length);
  }
  parts.push(rest);
  return (values) =>
    parts.map((part, index) => (index % 2 ? escapeHtml(values[part] ?? "") : part)).join("");
}

function mountOf(base) {
  const trimmed = String(base ?? "/").replace(/^\/+|\/+$/gu, "");
  return trimmed ? `/${trimmed}` : "";
}

/** Path of an absolute URL under the site base, e.g. "/de/magazin/a/". */
export function localPathOf(loc, base) {
  const mount = mountOf(base);
  const path = new URL(loc).pathname;
  return mount && (path === mount || path.startsWith(`${mount}/`))
    ? path.slice(mount.length) || "/"
    : path;
}

/**
 * The locale of a site path and its segments after the locale prefix. A
 * path without a locale prefix belongs to the default locale.
 */
export function splitLocale(path, i18n, fallback) {
  const segments = String(path ?? "")
    .split("/")
    .filter(Boolean);
  if (!i18n) return { locale: fallback, segments };
  const first = segments[0];
  if (
    first &&
    i18n.locales.includes(first) &&
    (first !== i18n.defaultLocale || i18n.prefixDefaultLocale)
  )
    return { locale: first, segments: segments.slice(1) };
  return { locale: i18n.defaultLocale, segments };
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function slug(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/**
 * Group one locale's pages by the first path segment after the locale and
 * base. A group's label is the title of the segment's own listed index page,
 * else the segment text. A segment with fewer than two listed pages joins
 * the top-level group. Within a group the index page comes first, then the
 * rest by title; the top-level group comes first, then the others by label.
 *
 * @param {{ href: string, segments: string[], title: string, description?: string, lastmod?: string }[]} pages
 */
export function groupSitemapPages(pages, { topLabel, locale = "en" }) {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const bySegment = new Map();
  for (const page of pages) {
    const segment = page.segments[0] ?? "";
    if (!bySegment.has(segment)) bySegment.set(segment, []);
    bySegment.get(segment).push(page);
  }
  const sorted = (members, depth) =>
    [...members].sort(
      (a, b) =>
        Number(b.segments.length === depth) - Number(a.segments.length === depth) ||
        collator.compare(a.title, b.title) ||
        (a.href < b.href ? -1 : a.href > b.href ? 1 : 0),
    );
  const top = [];
  const others = [];
  for (const [segment, members] of bySegment) {
    if (segment === "" || members.length < 2) {
      top.push(...members);
      continue;
    }
    const index = members.find((page) => page.segments.length === 1);
    others.push({
      key: segment,
      label: index?.title || decodeSegment(segment),
      pages: sorted(members, 1),
    });
  }
  others.sort((a, b) => collator.compare(a.label, b.label) || (a.key < b.key ? -1 : 1));
  const groups = [
    ...(top.length ? [{ key: "", label: topLabel, pages: sorted(top, 0) }] : []),
    ...others,
  ];
  const used = new Set();
  return groups.map((group, index) => {
    const base = `sitemap-${slug(group.key ? decodeSegment(group.key) : group.label) || `group-${index + 1}`}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return { id, label: group.label, pages: group.pages };
  });
}

function templateError(source, what, routeOwner = "plugin") {
  return new Error(
    `sitemap: the HTML sitemap ${source} has no ${what}. The page is filled at build from its own rendered template; a host override or changed markup removed it. ${remedies[routeOwner]}, or turn the page off with ${optOut}.`,
  );
}

// The element around index: from the last "<tag" before it to the first
// "</tag>" after it.
function enclosing(html, index, tag) {
  let start = -1;
  for (const match of html.slice(0, index).matchAll(new RegExp(`<${tag}[\\s>]`, "giu")))
    start = match.index;
  const close = html.toLowerCase().indexOf(`</${tag}>`, index);
  return start < 0 || close < 0 ? null : { start, end: close + tag.length + 3 };
}

/**
 * Fill the rendered template of the sitemap page with the groups. Only the
 * template regions are touched: the intro element around the total and the
 * template group's <section>. The template is validated before any value is
 * inserted; inserted values are never scanned. Throws when the template
 * group, its row or the total is missing or malformed.
 */
export function fillSitemapPage(html, { groups, nonce, noDate = "—", source = "page", routeOwner = "plugin" }) {
  const tokens = sitemapTokens(nonce);
  const prefix = tokens.total.slice(0, tokens.total.length - "TOTAL_".length);
  const groupAt = html.indexOf(tokens.groupId);
  if (groupAt < 0) throw templateError(source, "template group", routeOwner);
  const section = enclosing(html, groupAt, "section");
  if (!section) throw templateError(source, "template group <section>", routeOwner);
  const totalAt = html.indexOf(tokens.total);
  if (totalAt < 0) throw templateError(source, "total count", routeOwner);
  const intro = enclosing(html, totalAt, "p");
  if (!intro || intro.end > section.start) throw templateError(source, "intro element before its template group", routeOwner);
  // No token may sit outside the two regions (a second group, a stray row).
  const outside = [html.slice(0, intro.start), html.slice(intro.end, section.start), html.slice(section.end)];
  if (outside.some((part) => part.includes(prefix))) throw templateError(source, "single template group", routeOwner);
  const group = html.slice(section.start, section.end);
  const hrefAt = group.indexOf(tokens.href);
  if (hrefAt < 0) throw templateError(source, "template row", routeOwner);
  const row = enclosing(group, hrefAt, "tr");
  if (!row) throw templateError(source, "template row <tr>", routeOwner);
  const rowTemplate = group.slice(row.start, row.end);
  for (const key of ["title", "date"])
    if (!rowTemplate.includes(tokens[key])) throw templateError(source, `${key} token in its template row`, routeOwner);
  // A page without a description drops the description element; a page
  // without a date shows the fallback text instead of the <time> element.
  const without = (text, token, tag, replacement = "") => {
    const at = text.indexOf(token);
    const element = at < 0 ? null : enclosing(text, at, tag);
    return element ? text.slice(0, element.start) + replacement + text.slice(element.end) : text;
  };
  const undated = (text) => without(text, tokens.dateTime, "time", tokens.date);
  const bareRow = without(rowTemplate, tokens.description, "span");
  const rowKeys = ["href", "title", "description", "date", "dateTime"];
  const groupKeys = ["groupId", "groupLabel", "groupCount"];
  const fillIntro = splitTokens(html.slice(intro.start, intro.end), tokens, ["total"], source, "intro", routeOwner);
  const fillHead = splitTokens(group.slice(0, row.start), tokens, groupKeys, source, "group template", routeOwner);
  const fillTail = splitTokens(group.slice(row.end), tokens, groupKeys, source, "group template", routeOwner);
  const fills = new Map(
    [
      ["description dated", rowTemplate],
      ["bare dated", bareRow],
      ["description undated", undated(rowTemplate)],
      ["bare undated", undated(bareRow)],
    ].map(([key, text]) => [key, splitTokens(text, tokens, rowKeys, source, "row template", routeOwner)]),
  );
  const total = groups.reduce((sum, item) => sum + item.pages.length, 0);
  const filled = groups.map((item) => {
    const values = { groupId: item.id, groupLabel: item.label, groupCount: String(item.pages.length) };
    const rows = item.pages.map((page) =>
      fills.get(`${page.description ? "description" : "bare"} ${page.lastmod ? "dated" : "undated"}`)({
        href: page.href,
        title: page.title,
        description: page.description ?? "",
        date: page.lastmod ? displayDate(page.lastmod) : noDate,
        dateTime: page.lastmod ?? "",
      }),
    );
    return fillHead(values) + rows.join("") + fillTail(values);
  });
  return (
    html.slice(0, intro.start) +
    fillIntro({ total: String(total) }) +
    html.slice(intro.end, section.start) +
    filled.join("") +
    html.slice(section.end)
  );
}

/**
 * The data rows a filled page renders: the <tbody> rows of each group's
 * <section>, found by the group heading ids.
 */
export function countRenderedRows(html, ids) {
  let rows = 0;
  for (const id of ids) {
    const marker = `aria-labelledby="${escapeHtml(id)}"`;
    const at = html.indexOf(marker);
    const section = at < 0 ? null : enclosing(html, at, "section");
    if (!section) continue;
    for (const body of html.slice(section.start, section.end).matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/giu))
      rows += [...body[1].matchAll(/<tr[\s>]/giu)].length;
  }
  return rows;
}

/**
 * Fill every locale's sitemap page from the scan. pages: [{ locale,
 * pathname, copy }]. Returns the files to write over the built pages.
 * Throws unless the rows across all pages equal the XML entries.
 */
export function renderHtmlSitemaps({ root, entries, details, site, base = "/", i18n = null, lang, pages, nonce, routeOwner = "plugin" }) {
  const lists = new Map(pages.map((page) => [page.locale, []]));
  for (const entry of entries) {
    const path = localPathOf(entry.loc, base);
    const { locale, segments } = splitLocale(path, i18n, lang);
    const list = lists.get(locale);
    if (!list)
      throw new Error(`sitemap: ${entry.loc} belongs to locale ${locale}, which has no HTML sitemap page.`);
    const detail = details.get(entry.loc);
    list.push({
      loc: entry.loc,
      href: new URL(entry.loc).pathname,
      segments,
      title: detail?.title || decodeSegment(path),
      description: detail?.description ?? "",
      lastmod: entry.lastmod,
    });
  }
  const files = [];
  let rows = 0;
  for (const page of pages) {
    const found = htmlFile(root, page.pathname);
    const source = `/${String(page.pathname).replace(/^\/+/u, "")}`;
    if (!found) throw templateError(source, "built HTML file", routeOwner);
    const list = lists.get(page.locale);
    const own = new URL(page.href, site).href;
    if (!list.some((item) => item.loc === own || item.loc === own.replace(/\/$/u, "") || item.loc === `${own}/`))
      throw new Error(
        `sitemap: the HTML sitemap ${source} is not listed in sitemap.xml (it must name itself as canonical without noindex).${routeOwner === "host" ? ` The host page (sitemap.routeOwner "host") must give its layout SEO metadata with url ${own} and no noindex.` : ""} Turn the page off with ${optOut}.`,
      );
    const groups = groupSitemapPages(list, { topLabel: page.copy.topLabel, locale: page.locale });
    const content = fillSitemapPage(readFileSync(found.file, "utf8"), {
      groups,
      nonce,
      noDate: page.copy.noDate,
      source,
      routeOwner,
    });
    // Count what was rendered, not what went in: a template with an extra
    // static row would list more rows than sitemap.xml has URLs.
    const rendered = countRenderedRows(content, groups.map((group) => group.id));
    if (rendered !== list.length)
      throw new Error(
        `sitemap: the HTML sitemap ${source} renders ${rendered} rows for ${list.length} URLs of its locale; its template must hold exactly one data row. ${remedies[routeOwner]}, or turn the page off with ${optOut}.`,
      );
    rows += rendered;
    files.push({ name: found.relative, content, rows: rendered, locale: page.locale });
  }
  if (rows !== entries.length)
    throw new Error(`sitemap: the HTML sitemap pages list ${rows} rows, sitemap.xml lists ${entries.length} URLs.`);
  return files;
}

// ----------------------------------------------------------------- xsl view

/** The state script Layout inlines (@wpmoo/ui/state.js), or "". */
export function readStateScript() {
  try {
    const file = createRequire(import.meta.url).resolve("@wpmoo/ui/state.js");
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/**
 * Where the xsl takes its look: the default locale's sitemap page, else the
 * built home page, else the first listed page. Returns the stylesheet hrefs
 * as root-relative paths (resolved against that page's address) and the
 * page's lang, dir, theme and site name.
 */
export function xslSource({ root, site, base = "/", pagePathname = null, entries = [], details = new Map() }) {
  const candidates = [
    ...(pagePathname !== null ? [pagePathname] : []),
    "",
    ...entries.slice(0, 1).map((entry) => details.get(entry.loc)?.pathname ?? ""),
  ];
  let found = null;
  for (const pathname of candidates) {
    found = htmlFile(root, pathname);
    if (found) break;
  }
  if (!found) return { stylesheets: [], lang: undefined, dir: undefined, theme: undefined, siteName: undefined };
  const html = readFileSync(found.file, "utf8");
  const head = parseHead(html);
  const mount = mountOf(base);
  const pageUrl = new URL(`${mount}/${found.relative.replace(/index\.html$/u, "")}`, site);
  const origin = new URL(site).origin;
  const stylesheets = [];
  for (const href of head.stylesheets) {
    let url;
    try {
      url = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(url.protocol)) continue;
    const value = url.origin === origin ? `${url.pathname}${url.search}` : url.href;
    if (!stylesheets.includes(value)) stylesheets.push(value);
  }
  const htmlTag = /<html\b(?:[^>"']|"[^"]*"|'[^']*')*>/iu.exec(html)?.[0];
  const htmlAttributes = htmlTag ? parseAttributes(htmlTag) : {};
  let theme;
  for (const match of html.matchAll(/<div\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu)) {
    const attributes = parseAttributes(match[0]);
    if (String(attributes.class ?? "").split(/\s+/u).includes("moo-ui")) {
      theme = ["light", "dark"].includes(attributes["data-bs-theme"]) ? attributes["data-bs-theme"] : undefined;
      break;
    }
  }
  return {
    stylesheets,
    lang: htmlAttributes.lang,
    dir: ["ltr", "rtl"].includes(htmlAttributes.dir) ? htmlAttributes.dir : undefined,
    theme,
    siteName: head.meta.siteName,
    title: pageTitleOf(head, pageUrl.href),
  };
}

function xmlText(text) {
  return String(text ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

// A literal attribute of a result element is an attribute value template:
// braces are doubled so they stay text.
function xslAttribute(text) {
  return xmlText(text).replace(/\{/gu, "{{").replace(/\}/gu, "}}");
}

function placeholders(text, parts) {
  return String(text)
    .split(/(\{[a-z]+\})/u)
    .map((piece) => (Object.hasOwn(parts, piece) ? parts[piece] : xmlText(piece)))
    .join("");
}

const listed = "sitemap:urlset/sitemap:url | sitemap:sitemapindex/sitemap:sitemap";

/**
 * sitemap.xsl: Core's xsl markup and classes, with noindex, the stylesheet
 * hrefs and the inlined state script of a built page, and a link to the HTML
 * sitemap page when it is on. It renders a urlset and a sitemap index alike
 * (an index lists its sitemap files).
 */
export function renderSitemapXsl({ copy, lang = "en", dir = "ltr", theme = "light", siteName, stylesheets = [], stateScript = "", pageHref = null }) {
  const intro = placeholders(copy.xmlIntro, {
    "{count}": `<strong><xsl:value-of select="count(${listed})"/></strong>`,
  });
  const pageLink = pageHref
    ? `\n                  ${placeholders(copy.xmlPageLink, {
        "{page}": `<a href="${xslAttribute(pageHref)}">${xmlText(copy.xmlPageLabel)}</a>`,
      })}`
    : "";
  const script = stateScript
    ? `\n          <script><![CDATA[${stateScript.replace(/\]\]>/gu, "]]]]><![CDATA[>")}]]></script>`
    : "";
  const links = stylesheets
    .map((href) => `\n        <link rel="stylesheet" href="${xslAttribute(href)}"/>`)
    .join("");
  const title = siteName ? `${copy.xmlTitle} — ${siteName}` : copy.xmlTitle;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Presents sitemap.xml to people who open it in a browser. Search engines read
  the XML itself and ignore this stylesheet. Written by @wpmoo/astro at build
  with the site's own stylesheet links and theme bootstrap. Browsers without
  XSLT show the plain XML instead.
-->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  exclude-result-prefixes="sitemap">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <xsl:text disable-output-escaping="yes">&lt;!doctype html&gt;</xsl:text>
    <html lang="${xslAttribute(lang)}" dir="${xslAttribute(dir)}">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex, follow"/>
        <title>${xmlText(title)}</title>
        <link rel="icon" href="data:,"/>${links}
      </head>
      <body>
        <div class="moo-ui" data-bs-theme="${xslAttribute(theme)}" data-moo-document-owner="true">${script}
          <main class="container py-5">
            <div class="row justify-content-center">
              <div class="col-12 col-lg-10 col-xl-8">
                <h1 class="h2 mb-2">${xmlText(copy.xmlTitle)}</h1>
                <p class="text-body-secondary mb-4">
                  ${intro}${pageLink}
                </p>
                <div class="table-responsive">
                  <table class="table">
                    <thead>
                      <tr>
                        <th scope="col" class="text-end">#</th>
                        <th scope="col">${xmlText(copy.urlLabel)}</th>
                        <th scope="col" class="text-end">${xmlText(copy.lastModifiedLabel)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <xsl:for-each select="${listed}">
                        <tr>
                          <td class="text-end text-body-secondary"><xsl:value-of select="position()"/></td>
                          <td class="text-break">
                            <a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a>
                          </td>
                          <td class="text-end text-nowrap">
                            <xsl:choose>
                              <xsl:when test="sitemap:lastmod"><xsl:value-of select="sitemap:lastmod"/></xsl:when>
                              <xsl:otherwise><span class="text-body-secondary">${xmlText(copy.noDate)}</span></xsl:otherwise>
                            </xsl:choose>
                          </td>
                        </tr>
                      </xsl:for-each>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </main>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
`;
}
