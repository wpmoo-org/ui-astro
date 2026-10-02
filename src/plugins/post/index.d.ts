import type { Plugin } from "../index.js";

export interface PostOptions {
  label?: string;
  basePath?: string;
  source?: URL;
  formats?: readonly ["md"] | readonly ["md", "mdx"];
  taxonomies?: readonly string[];
  routes?: { single?: "plugin" | "host"; archive?: "plugin" | "host" };
  locales?: Plugin["locales"];
}

export declare function post(options?: PostOptions): Plugin;
