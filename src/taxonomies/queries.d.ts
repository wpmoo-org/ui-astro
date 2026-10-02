import type { EntryClassContext } from "../config/index.js";
import type { Term } from "./content.js";

export interface TermItem {
  readonly id: string;
  readonly type: string;
  readonly entryId: string;
  readonly title: string;
  readonly href: string;
  readonly entryContext: EntryClassContext;
  readonly description?: string;
  readonly date?: Date;
}

export interface TaxonomyPath {
  params: { taxonomy: string; slug: string };
  props: {
    taxonomy: string;
    term: Term;
    href: string;
    breadcrumbs: { label: string; href?: string }[];
    items: readonly TermItem[];
    locale?: string;
    alternates?: readonly { readonly locale: string; readonly href: string }[];
  };
}

export declare function getTaxonomyTerms(
  taxonomyId: string,
  options?: { locale?: string },
): Promise<readonly Term[]>;
export declare function getTermEntries(
  taxonomyId: string,
  termId: string,
  options?: { include?: "direct" | "descendants"; locale?: string },
): Promise<readonly TermItem[]>;
export declare function getTaxonomyPaths(options?: {
  taxonomies?: readonly string[];
  locale?: string;
}): Promise<TaxonomyPath[]>;
