export interface TaxonomyInput {
  id: string;
  label: string;
  source: URL;
  sourceKind?: "json" | "json-directory";
  hierarchical?: boolean;
  archive?: false | { include?: "direct" | "descendants" };
  locales?: Readonly<
    Record<string, { readonly label?: string; readonly slug?: string }>
  >;
}

export interface Taxonomy {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly sourceKind: "json" | "json-directory";
  readonly hierarchical: boolean;
  readonly archive: false | { readonly include: "direct" | "descendants" };
  readonly locales?: Readonly<
    Record<string, { readonly label?: string; readonly slug?: string }>
  >;
}

export declare function defineTaxonomy(input: TaxonomyInput): Taxonomy;
