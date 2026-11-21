import type { ComponentProps } from "astro/types";
import type Sidebar from "../components/Sidebar.astro";
import type { SiteLogo, SitePresentation, SiteLabelsInput } from "../config/index.js";
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
type SidebarGroups = NonNullable<ComponentProps<typeof Sidebar>["groups"]>;
/** Navigation placement in `sidebar.mode: "header"`; `"main"` is omitted. */
export type NavigationPlacement = "utility" | "drawer";
type SidebarItemInput = SidebarGroups[number]["items"][number];
export type SiteNavigationItem = SidebarItemInput & {
  placement?: NavigationPlacement;
  children?: (NonNullable<SidebarItemInput["children"]>[number] & { placement?: NavigationPlacement })[];
};
export type SiteNavigationGroup = Omit<SidebarGroups[number], "items"> & {
  items: SiteNavigationItem[];
};
export interface SiteChrome {
  readonly locale: string;
  readonly brand: string;
  readonly logo: SiteLogo | null;
  readonly homeHref: string;
  readonly homeNavigation?: Readonly<{ href: string; active?: boolean; placement?: NavigationPlacement }> | null;
  readonly languageLinks: readonly LanguageLink[];
  readonly breadcrumbs: readonly { label: string; href?: string }[];
  readonly navigation: SiteNavigationGroup[];
  readonly taxonomyGroups: readonly TaxonomyLinkGroup[];
  readonly presentation: SitePresentation & {
    readonly labels: Readonly<Required<SiteLabelsInput>>;
  };
}
