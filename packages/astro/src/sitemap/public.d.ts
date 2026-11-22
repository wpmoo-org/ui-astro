import type { PageOptions, SiteConfig } from "../config/index.js";
import type { LanguageLink } from "../i18n/index.js";
import type { SitemapMessages } from "../integration/index.js";

export interface SitemapOptions {
  /** Resolved copy of the page; `copy.title` is its title (h1, `<title>`). */
  readonly copy: Readonly<SitemapMessages>;
  readonly locale: string;
  readonly site: SiteConfig;
  /** The page's own address (base and trailing slash applied), its canonical. */
  readonly href: string;
  /** Address of sitemap.xml. */
  readonly xmlHref: string;
  /** Shared Page single preferences of the locale. */
  readonly options: Readonly<PageOptions>;
  /** The sitemap page of every active locale, for hreflang alternates. */
  readonly languageLinks: readonly LanguageLink[];
}

/** Copy, page address, preferences and locale links of a locale's HTML sitemap page. */
export declare function getSitemapOptions(locale?: string): SitemapOptions;
