import type { ComponentProps } from "astro/types";
import type Sidebar from "../components/Sidebar.astro";
import type { SitePresentation, SiteLabelsInput } from "../config/index.js";
import type { LanguageLink } from "../i18n/index.js";
export interface TaxonomyLinkGroup {
  readonly id: string;
  readonly label: string;
  readonly links: readonly {
    readonly id: string;
    readonly label: string;
    readonly href: string;
  }[];
}
export interface SiteChrome {
  readonly locale: string;
  readonly brand: string;
  readonly homeHref: string;
  readonly languageLinks: readonly LanguageLink[];
  readonly breadcrumbs: readonly { label: string; href?: string }[];
  readonly navigation: NonNullable<ComponentProps<typeof Sidebar>["groups"]>;
  readonly taxonomyGroups: readonly TaxonomyLinkGroup[];
  readonly presentation: SitePresentation & {
    readonly labels: Readonly<Required<SiteLabelsInput>>;
  };
}
