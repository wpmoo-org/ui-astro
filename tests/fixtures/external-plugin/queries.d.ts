import type { CollectionEntry } from "astro:content";
import type { EntryClassContext } from "@wpmoo/astro/config";

export interface SampleLoopItem {
  id: string;
  title: string;
  href: string;
  description?: string;
  date?: Date;
  entryContext: EntryClassContext;
}

export declare function getPublishedSamples(): Promise<
  CollectionEntry<"sample">[]
>;
export declare function getSamplePaths(): Promise<
  {
    params: { slug: string };
    props: { entry: CollectionEntry<"sample"> };
  }[]
>;
export declare function sampleLoopItems(
  entries: readonly CollectionEntry<"sample">[],
): SampleLoopItem[];
