import type { SiteConfig } from "../config/index.js";
import type { Taxonomy } from "../taxonomies/index.js";

export interface SiteContext {
  readonly site: SiteConfig;
  readonly base: string;
  readonly trailingSlash: "always" | "never" | "ignore";
  readonly taxonomies: readonly Omit<Taxonomy, "source">[];
  readonly taxonomyBasePath: string;
  readonly plugins: readonly {
    readonly id: string;
    readonly label: string;
    readonly basePath: string;
    readonly contentTypes: readonly {
      readonly id: string;
      readonly collection: string;
      readonly sourceKind: "markdown" | "json" | "json-directory";
      readonly formats: readonly ("md" | "mdx")[];
      readonly singleRoute: string;
      readonly taxonomies: readonly string[];
    }[];
  }[];
}

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly active: boolean;
}

export declare function getSiteContext(): SiteContext;
export declare function getSiteNavigation(currentPath: string): Promise<readonly NavigationItem[]>;
export declare function getEntryHref(typeId: string, entry: {
  readonly collection: string;
  readonly id: string;
  readonly data: { readonly status: string; readonly slug?: string };
}): string;
export declare function validateSiteContent(): Promise<void>;
