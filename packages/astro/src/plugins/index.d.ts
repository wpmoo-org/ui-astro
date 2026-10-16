export type PluginSourceInput =
  | {
      kind: "markdown";
      base?: URL;
      formats: readonly ["md"] | readonly ["md", "mdx"];
    }
  | { kind: "json"; file: URL }
  | { kind: "json-directory"; base: URL };

export type PluginSource =
  | {
      readonly kind: "markdown";
      readonly base?: string;
      readonly formats: readonly ("md" | "mdx")[];
    }
  | { readonly kind: "json"; readonly file: string }
  | { readonly kind: "json-directory"; readonly base: string };

export interface ContentTypeInput {
  id: string;
  collection: string;
  singleRoute: string;
  source: PluginSourceInput;
  taxonomies?: readonly string[];
}

export interface ContentType {
  readonly id: string;
  readonly collection: string;
  readonly singleRoute: string;
  readonly source: PluginSource;
  readonly taxonomies: readonly string[];
}

export type PluginRouteInput =
  | {
      id: string;
      pattern: string;
      prerender: true;
      owner?: "plugin";
      entrypoint: URL;
    }
  | {
      id: string;
      pattern: string;
      prerender: true;
      owner: "host";
      entrypoint?: never;
    };

export type PluginRoute =
  | {
      readonly id: string;
      readonly pattern: string;
      readonly prerender: true;
      readonly owner: "plugin";
      readonly entrypoint: string;
    }
  | {
      readonly id: string;
      readonly pattern: string;
      readonly prerender: true;
      readonly owner: "host";
    };

export interface PluginNavigationInput {
  label: string;
  path: string;
  match?: "exact" | "prefix";
}

export interface PluginNavigation {
  readonly label: string;
  readonly path: string;
  readonly match: "exact" | "prefix";
}

export interface PluginInput {
  apiVersion: 1;
  id: string;
  label: string;
  basePath: string;
  contentTypes: readonly ContentTypeInput[];
  routes: readonly PluginRouteInput[];
  navigation?: readonly PluginNavigationInput[];
  locales?: Readonly<
    Record<string, { readonly label?: string; readonly basePath?: string }>
  >;
}

export interface Plugin {
  readonly apiVersion: 1;
  readonly id: string;
  readonly label: string;
  readonly basePath: string;
  readonly contentTypes: readonly ContentType[];
  readonly routes: readonly PluginRoute[];
  readonly navigation: readonly PluginNavigation[];
  readonly locales?: Readonly<
    Record<string, { readonly label?: string; readonly basePath?: string }>
  >;
}

export declare function definePlugin(input: PluginInput): Plugin;
