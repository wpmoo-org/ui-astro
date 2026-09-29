import type { CollectionEntry } from "astro:content";

export declare function getPublishedPages(): Promise<CollectionEntry<"page">[]>;
export declare function getPagePaths(options?: {
  reservedPrefixes?: readonly string[];
  lang?: string;
}): Promise<Array<{ params: { slug: string | undefined }; props: { entry: CollectionEntry<"page"> } }>>;
