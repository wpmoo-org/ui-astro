import type { z } from "astro/zod";

export type ViewKind = "single" | "archive";
export type PageWidth = "base" | "sm" | "md" | "lg" | "xl" | "xxl" | "fluid";
export type Spacing = 0 | 1 | 2 | 3 | 4 | 5;
type SpacingProperty =
  | "p"
  | "px"
  | "py"
  | "pt"
  | "pb"
  | "ps"
  | "pe"
  | "m"
  | "mx"
  | "my"
  | "mt"
  | "mb"
  | "ms"
  | "me"
  | "gap"
  | "row-gap"
  | "column-gap";
type Breakpoint = "sm" | "md" | "lg" | "xl" | "xxl";
type Color =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "light"
  | "dark";
export type UtilityToken =
  | `${SpacingProperty}-${Spacing}`
  | `${SpacingProperty}-${Breakpoint}-${Spacing}`
  | `bg-${Color | "body" | "body-secondary" | "body-tertiary"}`
  | `text-${Color | "body" | "body-secondary" | "body-tertiary" | "body-emphasis"}`
  | `link-${Color | "body-emphasis"}`
  | "d-flex"
  | "d-block"
  | "d-inline-flex"
  | "flex-column"
  | "flex-row"
  | "flex-wrap"
  | "align-items-center"
  | "align-items-start"
  | "align-items-end"
  | "justify-content-between"
  | "justify-content-center"
  | "justify-content-start"
  | "justify-content-end"
  | "list-unstyled"
  | "small"
  | "text-start"
  | "text-center"
  | "text-end"
  | "text-decoration-none"
  | "fw-normal"
  | "fw-medium"
  | "fw-semibold"
  | "fw-bold"
  | "border"
  | "border-0"
  | "border-top"
  | "border-bottom"
  | "rounded"
  | "rounded-0"
  | "ms-auto"
  | "me-auto"
  | "mx-auto";
export type PageTitleUtilityToken = Exclude<
  UtilityToken,
  "fw-normal" | "fw-medium" | "fw-bold"
>;
export type DescriptionUtilityToken = Exclude<
  UtilityToken,
  `text-${Color | "body" | "body-tertiary" | "body-emphasis"}`
>;
type BottomMarginUtility =
  | `${"m" | "my" | "mb"}-${Exclude<Spacing, 0>}`
  | `${"m" | "my" | "mb"}-${Breakpoint}-${Exclude<Spacing, 0>}`;
export type PageDescriptionUtilityToken = Exclude<
  DescriptionUtilityToken,
  BottomMarginUtility
>;
export type DateStyle = "iso" | "short" | "medium" | "long" | "full";
export type DateFormatter = (date: Date) => string;
export interface TriggerInput {
  variant?:
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link"
  | "success"
  | "warning"
  | "info"
  | "light"
  | "dark"
  | "outline-primary"
  | "outline-success"
  | "outline-danger";
  size?: "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  icon?:
  | "panel-left"
  | "chevrons-left"
  | "chevrons-right"
  | "ellipsis"
  | "list-filter";
}
interface ContentPartInput {
  utilities?: readonly UtilityToken[];
  scrollUtilities?: readonly ("scroll-fade-y" | "no-scrollbar")[];
}
interface HeaderPartInput {
  utilities?: readonly UtilityToken[];
  contentUtilities?: readonly UtilityToken[];
  breadcrumbUtilities?: readonly UtilityToken[];
  trigger?: TriggerInput;
  toggleLabel?: string;
  navigationLabel?: string;
  breadcrumbLabel?: string;
  skipLabel?: string;
}
interface PageHeaderPartBase {
  utilities?: readonly UtilityToken[];
  titleUtilities?: readonly PageTitleUtilityToken[];
}
type PageHeaderPartInput = PageHeaderPartBase &
  (
    | {
      descriptionVariant?: "page-description";
      descriptionUtilities?: readonly PageDescriptionUtilityToken[];
    }
    | {
      descriptionVariant: "muted";
      descriptionUtilities?: readonly DescriptionUtilityToken[];
    }
  );
interface LoopPartInput {
  utilities?: readonly UtilityToken[];
  itemUtilities?: readonly UtilityToken[];
  titleUtilities?: readonly UtilityToken[];
  descriptionUtilities?: readonly UtilityToken[];
  emptyUtilities?: readonly UtilityToken[];
  titleVariant?: "section-title" | "subsection-title";
  dateStyle?: DateStyle;
  emptyText?: string;
  pageEmptyText?: string;
  postEmptyText?: string;
  pageTitle?: string;
  postTitle?: string;
}
interface FooterPartInput {
  utilities?: readonly UtilityToken[];
  linkUtilities?: readonly UtilityToken[];
}
export interface PartsInput {
  content?: ContentPartInput;
  header?: HeaderPartInput;
  pageHeader?: PageHeaderPartInput;
  loop?: LoopPartInput;
  footer?: FooterPartInput;
}
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export interface Parts {
  readonly content: Readonly<Required<ContentPartInput>>;
  readonly header: Readonly<Required<Omit<HeaderPartInput, "trigger">>> & {
    readonly trigger: Readonly<Required<TriggerInput>>;
  };
  readonly pageHeader: Readonly<Required<PageHeaderPartInput>>;
  readonly loop: Readonly<Required<LoopPartInput>>;
  readonly footer: Readonly<Required<FooterPartInput>>;
}

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
  parts?: PartsInput;
}

export interface PageOptions {
  shellMode: "viewport" | "contained";
  pageWidth: PageWidth;
  headerWidth: PageWidth | null;
  theme: "light" | "dark";
  lang: string;
  dir: "ltr" | "rtl";
  sidebar: Readonly<Required<SidebarOptionsInput>> | null;
  parts: Parts;
}

export interface TypeOptionsInput extends PageOptionsInput {
  views?: Partial<Record<ViewKind, PageOptionsInput>>;
}

export interface SiteInput {
  brand?: string;
  organization?: OrganizationInput;
  seo?: SeoInput;
  defaults?: PageOptionsInput;
  locales?: Record<string, PageOptionsInput>;
  types?: Record<string, TypeOptionsInput>;
}

export interface SiteConfig {
  readonly brand: string;
  readonly organization?: DeepReadonly<OrganizationInput>;
  readonly seo?: DeepReadonly<SeoInput>;
  readonly defaults: Readonly<PageOptions>;
  readonly locales?: Readonly<Record<string, NormalizedPageOptionsInput>>;
  readonly types: Readonly<Record<string, NormalizedTypeOptions>>;
}

export interface OrganizationInput {
  name: string;
  names?: Readonly<Record<string, string>>;
}
export interface TitleTemplateGroup {
  home?: string;
  default?: string;
  types?: Readonly<Record<string, Readonly<Partial<Record<ViewKind, string>>>>>;
}
export interface SeoInput {
  titleTemplates?: TitleTemplateGroup & {
    locales?: Readonly<Record<string, TitleTemplateGroup>>;
  };
}

type NormalizedPageOptionsInput = Readonly<
  Omit<PageOptionsInput, "sidebar" | "parts">
> & {
  readonly sidebar?: Readonly<SidebarOptionsInput> | null;
  readonly parts?: DeepReadonly<PartsInput>;
};

type NormalizedTypeOptions = NormalizedPageOptionsInput & {
  readonly views?: Readonly<
    Partial<Record<ViewKind, NormalizedPageOptionsInput>>
  >;
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
export declare function resolveParts(input?: PartsInput): Parts;
export declare function formatDate(
  date: Date,
  options?: { lang?: string; style?: DateStyle; formatter?: DateFormatter },
): string;
export declare function defineSite(input?: SiteInput): SiteConfig;
export declare function resolvePageOptions(
  site: SiteConfig,
  type: string,
  view: ViewKind,
  page?: PageOptionsInput,
  locale?: string,
): Readonly<PageOptions>;
export declare function getEntryClasses(
  context: EntryClassContext,
): readonly string[];
export declare function getPageClasses(
  context?: PageClassContext,
): readonly string[];
export declare function normalizeSlug(
  input: string,
  options?: { lang?: string },
): string;
