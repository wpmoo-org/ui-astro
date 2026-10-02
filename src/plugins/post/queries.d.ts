import type { CollectionEntry } from "astro:content";

export declare function getPublishedPosts(options?: {
  locale?: string;
}): Promise<CollectionEntry<"post">[]>;
export declare function getPostPaths(options?: {
  basePath?: string;
  lang?: string;
  locale?: string;
}): Promise<
  Array<{ params: { slug: string }; props: { entry: CollectionEntry<"post"> } }>
>;
