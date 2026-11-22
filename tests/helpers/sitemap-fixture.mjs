// An ibeb-like host site for the HTML sitemap: ten top-level pages, one
// single-page segment, and a "magazin" segment with an index page and 130
// long-titled articles. Used by tests/sitemap-page-build.test.mjs and, with
// an outDir, for a visual check served from apps/demo/dist. Also a small
// bilingual host-shell site that owns its sitemap pages
// (tests/sitemap-host-build.test.mjs).
import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const sdk = fileURLToPath(new URL("../../", import.meta.url));
export const fixtureSite = "https://example.test";

async function write(root, name, text) {
  const path = join(root, name);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
}

const topTitles = [
  "Über uns",
  "Kontakt",
  "Angebote für Familien",
  "Kitas und Familienzentren",
  "Beratung",
  "Spenden",
  "Stellenangebote",
  "Impressum",
  "Datenschutzerklärung",
];
const slugOf = (text) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");

/** Write the fixture site into root, linking the SDK and its dependencies. */
export async function createSitemapFixture(root, { base = "/", outDir } = {}) {
  await linkSdk(root);
  await write(root, "package.json", JSON.stringify({ private: true, type: "module" }));
  await write(
    root,
    "astro.config.mjs",
    `import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
export default defineConfig({ site: "${fixtureSite}", base: ${JSON.stringify(base)}, trailingSlash: "always", cacheDir: "./.astro-cache",${outDir ? ` outDir: ${JSON.stringify(outDir)},` : ""}
  integrations: [moo({ site: { brand: "Fixture e.V.", organization: { name: "Fixture e.V." }, defaults: { lang: "de" } }, plugins: [page()] })] });`,
  );
  await write(
    root,
    "src/content.config.ts",
    `import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
export const collections = { page: defineCollection({ loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: pageSchema }) };`,
  );
  const entry = (file, title, slug, extra = "") =>
    write(root, `src/content/page/${file}.md`, `---\ntitle: ${JSON.stringify(title)}\nslug: ${JSON.stringify(slug)}\nstatus: publish\n${extra}---\nText.`);
  await entry("index", "Startseite", "index", 'description: "Bildung, Beratung und Begegnung in Berlin."\n');
  for (const title of topTitles) await entry(slugOf(title), title, slugOf(title), `description: ${JSON.stringify(`${title}: kurze Beschreibung der Seite.`)}\n`);
  // A segment with one page joins the top-level group.
  await entry("team/vorstand", "Vorstand", "team/vorstand");
  await entry("magazin/index", "Magazin", "magazin", 'description: "Beiträge und Ausgaben des Magazins."\n');
  for (let index = 1; index <= 130; index += 1) {
    const number = String(index).padStart(3, "0");
    const title =
      index === 7
        ? "Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichenherstellungsbetriebsbesichtigung im Familienzentrum"
        : `Ausgabe ${Math.ceil(index / 20)}, Beitrag ${number}: Wie Kitas, Familienzentren und Schulen in Berlin-Spandau gemeinsam Übergänge für Kinder und Eltern gestalten`;
    const date = index % 3 === 0 ? `updated_at: "2026-${String((index % 12) + 1).padStart(2, "0")}-15T10:00:00+01:00"\n` : "";
    const description = index % 2 === 0 ? `description: ${JSON.stringify(`Ein Bericht aus der Praxis, Teil ${number}, mit Stimmen von Fachkräften, Eltern und Kindern.`)}\n` : "";
    await entry(`magazin/beitrag-${number}`, title, `magazin/beitrag-${number}`, date + description);
  }
}

const hostShell = `---
// An ibeb-like theme shell: required type/view/pageContext props, its own
// SEO metadata, header-actions and footer slots, wrapping SDK SiteLayout.
import SiteLayout from "@wpmoo/astro/layouts/SiteLayout.astro";
import { resolvePageOptions, type PageClassContext } from "@wpmoo/astro/config";
import { getSiteContext } from "@wpmoo/astro/context";
import { resolveSeoMetadata } from "@wpmoo/astro/seo";
import type { LanguageLink } from "@wpmoo/astro/i18n";

interface Props {
  title: string;
  description?: string;
  href: string;
  locale: string;
  type: string;
  view: "single" | "archive";
  pageContext?: PageClassContext;
  languageLinks?: readonly LanguageLink[];
}
const { title, description, href, locale, type, view, pageContext, languageLinks = [] } = Astro.props;
const { site } = getSiteContext();
const options = resolvePageOptions(site, type, view, undefined, locale);
const metadata = Astro.site
  ? resolveSeoMetadata(site, {
      title,
      description,
      url: new URL(href, Astro.site).href,
      status: "publish",
      type,
      view,
      lang: options.lang,
      alternates: languageLinks.length > 1 ? languageLinks.map((link) => ({ locale: link.locale, url: new URL(link.href, Astro.site).href })) : undefined,
    })
  : undefined;
---

<SiteLayout title={title} description={description} options={options} href={href} locale={locale} metadata={metadata} languageLinks={languageLinks} pageContext={pageContext}>
  <Fragment slot="header-actions">
    <nav aria-label="Service"><a href="/kontakt/">Kontakt</a></nav>
  </Fragment>
  <slot />
  <p slot="footer">Host shell footer</p>
</SiteLayout>
`;

/** A host sitemap page for a locale: the Shell, PageHeader and SitemapContent. */
export function hostSitemapPage(up, { content = "<SitemapContent />" } = {}) {
  return `---
import ContentFrame from "@wpmoo/astro/layouts/ContentFrame.astro";
import PageHeader from "@wpmoo/astro/includes/PageHeader.astro";
import SitemapContent from "@wpmoo/astro/blocks/SitemapContent.astro";
import { getSitemapOptions } from "@wpmoo/astro/sitemap";
import Shell from "${up}layouts/Shell.astro";

export const prerender = true;
const data = getSitemapOptions(Astro.currentLocale);
---

<Shell title={data.copy.title} href={data.href} locale={data.locale} type="page" view="single" pageContext={{ view: "native", key: "sitemap" }} languageLinks={data.languageLinks}>
  <ContentFrame element="article" dir={data.options.dir}>
    <PageHeader title={data.copy.title} parts={data.options.parts} />
    ${content}
  </ContentFrame>
</Shell>
`;
}

/**
 * A bilingual (en, de) site whose pages render through its own Shell and
 * that owns the HTML sitemap pages (sitemap.routeOwner "host"). Options:
 * pages: false leaves out the host sitemap pages; trailingSlash and format
 * (build.format) set the URL forms.
 */
export async function createSitemapHostFixture(root, { base = "/", outDir, routeOwner = "host", pages = true, trailingSlash = "always", format } = {}) {
  await linkSdk(root);
  await write(root, "package.json", JSON.stringify({ private: true, type: "module" }));
  await write(
    root,
    "astro.config.mjs",
    `import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
export default defineConfig({ site: "${fixtureSite}", base: ${JSON.stringify(base)}, trailingSlash: ${JSON.stringify(trailingSlash)}, cacheDir: "./.astro-cache",${outDir ? ` outDir: ${JSON.stringify(outDir)},` : ""}${format ? ` build: { format: ${JSON.stringify(format)} },` : ""}
  i18n: { locales: ["en", "de"], defaultLocale: "en", routing: { prefixDefaultLocale: false } },
  integrations: [moo({ site: { brand: "Host Fixture", organization: { name: "Host Fixture" }, defaults: { lang: "en" } }, plugins: [page()], sitemap: { routeOwner: ${JSON.stringify(routeOwner)} } })] });`,
  );
  await write(root, "src/layouts/Shell.astro", hostShell);
  if (pages) {
    await write(root, "src/pages/sitemap.astro", hostSitemapPage("../"));
    await write(root, "src/pages/de/sitemap.astro", hostSitemapPage("../../"));
  }
  await write(
    root,
    "src/content.config.ts",
    `import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
export const collections = { page: defineCollection({ loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: pageSchema }) };`,
  );
  const entry = (file, title, slug, locale, extra = "") =>
    write(root, `src/content/page/${file}.md`, `---\ntitle: ${JSON.stringify(title)}\nslug: ${JSON.stringify(slug)}\nstatus: publish\nlocale: ${locale}\n${extra}---\nText.`);
  await entry("en/index", "Home", "index", "en", 'description: "The home page."\ntranslationKey: home\n');
  await entry("en/about", "About", "about", "en", 'description: "Who we are."\n');
  await entry("en/contact", "Contact", "contact", "en", 'updated_at: "2026-05-02T08:00:00+02:00"\n');
  await entry("de/index", "Startseite", "index", "de", 'description: "Die Startseite."\ntranslationKey: home\n');
  await entry("de/kontakt", "Kontakt", "kontakt", "de");
}

async function linkSdk(root) {
  await mkdir(join(root, "node_modules/@wpmoo"), { recursive: true });
  for (const name of await readdir(join(sdk, "node_modules"))) {
    if (name === "@wpmoo") continue;
    await symlink(join(sdk, "node_modules", name), join(root, "node_modules", name));
  }
  await symlink(join(sdk, "node_modules/@wpmoo/ui"), join(root, "node_modules/@wpmoo/ui"));
  await cp(join(sdk, "packages/astro"), join(root, "node_modules/@wpmoo/astro"), {
    recursive: true,
    filter: (path) => !path.includes("/node_modules"),
  });
}

export function buildFixture(root) {
  return spawnSync(join(sdk, "node_modules/.bin/astro"), ["build"], { cwd: root, encoding: "utf8" });
}
