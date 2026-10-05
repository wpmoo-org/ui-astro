import type { ComponentProps } from "astro/types";
import type SDKSidebar from "@wpmoo/astro/includes/Sidebar.astro";
import type SDKHeader from "@wpmoo/astro/includes/Header.astro";
import type {
  EntryClassContext,
  PageClassContext,
  PageOptions,
} from "@wpmoo/astro/config";
import type { LanguageLink } from "@wpmoo/astro/i18n";
import type { SeoMetadata } from "@wpmoo/astro/seo";

export interface ThemeChrome {
  readonly brand: string;
  readonly homeHref: string;
  readonly navigation: readonly NonNullable<
    ComponentProps<typeof SDKSidebar>["groups"]
  >[number][];
  readonly languageLinks: readonly LanguageLink[];
  readonly breadcrumbs: readonly ComponentProps<
    typeof SDKHeader
  >["breadcrumbs"][number][];
}
export interface ThemeLayoutProps {
  chrome: ThemeChrome;
  options: Readonly<PageOptions>;
  title: string;
  description?: string;
  metadata?: SeoMetadata | null;
  pageContext?: PageClassContext;
}
export interface ThemeSingleProps {
  title: string;
  description?: string;
  entryContext?: EntryClassContext;
  options: Readonly<PageOptions>;
}
export interface ThemeArchiveProps {
  title: string;
  description?: string;
  options: Readonly<PageOptions>;
  items: readonly {
    readonly id: string;
    readonly title: string;
    readonly href: string;
    readonly description?: string;
    readonly date?: Date;
    readonly entryContext?: EntryClassContext;
  }[];
}
