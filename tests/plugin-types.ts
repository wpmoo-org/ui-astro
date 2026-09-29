import {
  definePlugin,
  type Plugin,
  type PluginInput,
  type PluginRouteInput,
  type PluginSourceInput,
} from "@wpmoo/astro/plugins";

const route = new URL("file:///site/src/pages/entry.astro");
const source: PluginSourceInput = { kind: "markdown", formats: ["md", "mdx"] };
const input: PluginInput = {
  apiVersion: 1,
  id: "sample",
  label: "Sample",
  basePath: "/sample",
  contentTypes: [{ id: "entry", collection: "entry", singleRoute: "single", source }],
  routes: [{ id: "single", pattern: "/[...slug]", prerender: true, entrypoint: route }],
};
const plugin: Plugin = definePlugin(input);
const host: PluginRouteInput = { id: "single", pattern: "/[...slug]", prerender: true, owner: "host" };
void [plugin, host];

// @ts-expect-error only API v1 is supported
const wrongVersion: PluginInput = { ...input, apiVersion: 2 };
// @ts-expect-error host routes cannot provide an entrypoint
const wrongHost: PluginRouteInput = { id: "single", pattern: "/[...slug]", prerender: true, owner: "host", entrypoint: route };
// @ts-expect-error the route must prerender
const wrongRoute: PluginRouteInput = { id: "single", pattern: "/[...slug]", prerender: false, entrypoint: route };
// @ts-expect-error unsupported Markdown format selection
const wrongSource: PluginSourceInput = { kind: "markdown", formats: ["mdx"] };
void [wrongVersion, wrongHost, wrongRoute, wrongSource];
