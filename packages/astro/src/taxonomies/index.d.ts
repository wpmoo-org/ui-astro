export interface TaxonomyInput {
  id: string;
  label: string;
  source: URL;
  sourceKind?: "json" | "json-directory";
  hierarchical?: boolean;
  archive?: false | { include?: "direct" | "descendants"; basePath?: string };
  locales?: Readonly<
    Record<
      string,
      {
        readonly label?: string;
        readonly slug?: string;
        readonly basePath?: string;
      }
    >
  >;
}

export interface Taxonomy {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly sourceKind: "json" | "json-directory";
  readonly hierarchical: boolean;
  readonly archive:
    | false
    | {
        readonly include: "direct" | "descendants";
        readonly basePath?: string;
      };
  readonly locales?: Readonly<
    Record<
      string,
      {
        readonly label?: string;
        readonly slug?: string;
        readonly basePath?: string;
      }
    >
  >;
}

export declare function defineTaxonomy(input: TaxonomyInput): Taxonomy;
