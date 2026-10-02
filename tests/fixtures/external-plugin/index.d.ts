import type { Plugin } from "@wpmoo/astro/plugins";

export interface SampleInput {
  source: URL;
  sourceKind?: "json" | "json-directory";
  taxonomies?: readonly string[];
}

export declare function sample(input: SampleInput): Plugin;
