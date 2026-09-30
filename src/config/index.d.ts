import type { z } from "astro/zod";

export type ViewKind = "single" | "archive";
export type PageWidth = "base" | "sm" | "md" | "lg" | "xl" | "xxl" | "fluid";

export interface SidebarOptionsInput {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "icon" | "offcanvas" | "none";
  rail?: boolean;
  defaultOpen?: boolean;
}

export interface PageOptionsInput {
  shellMode?: "viewport" | "contained";
  pageWidth?: PageWidth;
  headerWidth?: PageWidth | null;
  theme?: "light" | "dark";
  lang?: string;
  dir?: "ltr" | "rtl";
  sidebar?: SidebarOptionsInput | null;
}

export interface PageOptions {
  shellMode: "viewport" | "contained";
  pageWidth: PageWidth;
  headerWidth: PageWidth | null;
  theme: "light" | "dark";
  lang: string;
  dir: "ltr" | "rtl";
  sidebar: Readonly<Required<SidebarOptionsInput>> | null;
}

export interface TypeOptionsInput extends PageOptionsInput {
  views?: Partial<Record<ViewKind, PageOptionsInput>>;
}

export interface SiteInput {
  brand?: string;
  defaults?: PageOptionsInput;
  types?: Record<string, TypeOptionsInput>;
}

export interface SiteConfig {
  readonly brand: string;
  readonly defaults: Readonly<PageOptions>;
  readonly types: Readonly<Record<string, NormalizedTypeOptions>>;
}

type NormalizedPageOptionsInput = Readonly<Omit<PageOptionsInput, "sidebar">> & {
  readonly sidebar?: Readonly<SidebarOptionsInput> | null;
};

type NormalizedTypeOptions = NormalizedPageOptionsInput & {
  readonly views?: Readonly<Partial<Record<ViewKind, NormalizedPageOptionsInput>>>;
};

export interface EntryClassContext {
  type: string;
  id: string;
  source: "markdown" | "json";
  taxonomies?: Readonly<Record<string, readonly string[]>>;
}

export type PageClassContext =
  | { view: "single"; entry: EntryClassContext }
  | { view: "archive"; type: string }
  | { view: "taxonomy"; taxonomy: string; term: string }
  | { view: "native"; key: string };

export declare const layoutSchema: z.ZodType<PageOptionsInput>;
export declare function defineSite(input?: SiteInput): SiteConfig;
export declare function resolvePageOptions(
  site: SiteConfig,
  type: string,
  view: ViewKind,
  page?: PageOptionsInput,
): Readonly<PageOptions>;
export declare function getEntryClasses(context: EntryClassContext): readonly string[];
export declare function getPageClasses(context?: PageClassContext): readonly string[];
export declare function normalizeSlug(input: string, options?: { lang?: string }): string;
