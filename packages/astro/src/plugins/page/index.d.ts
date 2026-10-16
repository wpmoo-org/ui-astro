import type { Plugin } from "../index.js";

export interface PageOptions {
  source?: URL;
  formats?: readonly ["md"] | readonly ["md", "mdx"];
  taxonomies?: readonly string[];
  routes?: { single?: "plugin" | "host" };
  locales?: Plugin["locales"];
}

export declare function page(options?: PageOptions): Plugin;
