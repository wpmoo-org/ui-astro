import type { CollectionEntry } from "astro:content";

export declare function getPublishedPages(options?: {
  locale?: string;
}): Promise<CollectionEntry<"page">[]>;
export declare function getPagePaths(options?: {
  reservedPrefixes?: readonly string[];
  lang?: string;
  locale?: string;
}): Promise<
  Array<{
    params: { slug: string | undefined };
    props: { entry: CollectionEntry<"page"> };
  }>
>;
