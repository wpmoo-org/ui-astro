import type { CollectionKey } from "astro:content";
import type { AstroComponentFactory } from "astro/runtime/server/index.js";
import type { SiteChrome, TaxonomyLinkGroup } from "../site/index.d.ts";

export type PlacementLocation =
  | "header.before"
  | "header.after"
  | "content.before"
  | "content.after"
  | "entry.before-content"
  | "entry.after-content"
  | "entry.taxonomies"
  | "archive.before-list"
  | "archive.after-list"
  | "aside.content"
  | "footer.before"
  | "footer.after";
export type PlacementView =
  "home" | "single" | "archive" | "taxonomy" | "native" | "not-found";
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export interface PlacementConditions {
  views?: readonly PlacementView[];
  types?: readonly string[];
  locales?: readonly string[];
  entries?: readonly string[];
  translationKeys?: readonly string[];
  terms?: Readonly<Record<string, readonly string[]>>;
}
export interface PlacementInput {
  id: string;
  block: string;
  at: PlacementLocation;
  order?: number;
  mode?: "append" | "replace";
  props?: Readonly<Record<string, JsonValue>>;
  include?: PlacementConditions;
  exclude?: PlacementConditions;
}
export type BlockDefinition =
  | { component: URL; collection?: never; translationKey?: never }
  | { collection: CollectionKey; translationKey: string; component?: never };
export interface PlacementInputOptions {
  blocks?: Readonly<Record<string, BlockDefinition>>;
  placements?: readonly PlacementInput[];
}
export interface RenderContext<TData = Readonly<Record<string, unknown>>> {
  href: string;
  locale?: string;
  view: PlacementView;
  type?: string;
  title?: string;
  entry?: {
    readonly id: string;
    readonly translationKey?: string;
    readonly data?: TData;
    readonly taxonomies?: Readonly<Record<string, readonly string[]>>;
  };
  taxonomy?: { readonly id: string; readonly term: string };
  headings?: readonly { depth: number; slug: string; text: string }[];
}
export interface PreparedPlacement extends PlacementInput {
  readonly instanceId: string;
  readonly kind: "toc" | "entry-taxonomies" | "component" | "content";
  readonly Component?: AstroComponentFactory;
  readonly tocItems?: readonly { targetId: string; label: string }[];
  readonly title?: string;
  readonly headings?: readonly { slug: string }[];
}
export interface PlacementPlan<TData = Readonly<Record<string, unknown>>> {
  readonly contentId: string;
  readonly chrome: SiteChrome;
  readonly context: Readonly<RenderContext<TData>> & {
    readonly locale: string;
    readonly assignedTerms: readonly TaxonomyLinkGroup[];
  };
  readonly groups: Readonly<
    Partial<Record<PlacementLocation, readonly PreparedPlacement[]>>
  >;
  readonly labels: Readonly<Record<string, string>>;
  readonly links: Readonly<Record<string, string>>;
}
export declare function preparePlacements<
  TData = Readonly<Record<string, unknown>>,
>(context: RenderContext<TData>): Promise<PlacementPlan<TData>>;
export { contentBlockSchema } from "./content.js";
