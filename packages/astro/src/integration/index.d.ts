import type { AstroIntegration } from "astro";
import type { SiteInput } from "../config/index.js";
import type { Plugin } from "../plugins/index.js";
import type { Taxonomy } from "../taxonomies/index.js";
import type { NotFoundInput } from "../not-found/index.js";
import type { PlacementInputOptions } from "../placements/index.js";

/** A named thing whose first mention in Markdown content links to `href`. */
export interface TermLink {
  /** Spellings to match as whole words, for example a name and its short form. */
  terms: readonly string[];
  /** A site path (`/partner/x/`) or an https address. */
  href: string;
  /** The content file of the target itself, which then does not link to itself. */
  source?: URL | string;
  /** Root-relative globs (`**`, `*`, `?`) of the documents this entry applies to, for example one language folder. */
  include?: readonly string[];
}

/** Copy of the HTML sitemap page and of sitemap.xsl, as plain text. */
export interface SitemapMessages {
  title: string;
  /** Holds `{count}` and `{xml}` exactly once each. */
  intro: string;
  xmlLabel: string;
  pageLabel: string;
  updatedLabel: string;
  /** Label of the top-level group. */
  topLabel: string;
  /** Shown in the Updated column when a page records no date. */
  noDate: string;
  /** Dev server note: the full list appears in the build. */
  devNote: string;
  xmlTitle: string;
  /** Holds `{count}` exactly once. */
  xmlIntro: string;
  /** Holds `{page}` exactly once. */
  xmlPageLink: string;
  xmlPageLabel: string;
  urlLabel: string;
  lastModifiedLabel: string;
}

export interface SitemapInput {
  /**
   * Who renders each locale's HTML sitemap page. "plugin" (default): the SDK
   * route in SiteLayout's own chrome. "host": the site's own literal,
   * prerendered page at each locale's path (`/sitemap/`, `/de/sitemap/`)
   * placing `@wpmoo/astro/blocks/SitemapContent.astro`; set it when pages
   * render through the site's own shell.
   */
  routeOwner?: "plugin" | "host";
  /** Per-locale overrides; missing fields fall back like the 404 copy. */
  messages?: Record<string, Partial<SitemapMessages>>;
}

export interface MooInput extends PlacementInputOptions {
  site?: SiteInput;
  plugins?: readonly Plugin[];
  taxonomies?: readonly Taxonomy[];
  taxonomyBasePath?: string;
  taxonomyRoutes?: { archive?: "plugin" | "host" };
  notFound?: NotFoundInput;
  /** Owner and copy of the HTML sitemap page (`site.seo.htmlSitemap`) and sitemap.xsl copy. */
  sitemap?: SitemapInput;
  termLinks?: readonly TermLink[];
}

export default function moo(input?: MooInput): AstroIntegration;
