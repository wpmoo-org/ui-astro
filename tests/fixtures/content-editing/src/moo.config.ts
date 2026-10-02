import { defineSite } from "@wpmoo/astro/config";
import { definePlugin } from "@wpmoo/astro/plugins";
import { page } from "@wpmoo/astro/plugins/page";
import { defineTaxonomy } from "@wpmoo/astro/taxonomies";

export const bindings = ["category", "tag"];
export const taxonomies = [
  defineTaxonomy({
    id: "category",
    label: "Categories",
    source: new URL("./data/category/", import.meta.url),
    sourceKind: "json-directory",
    hierarchical: true,
    archive: false,
  }),
  defineTaxonomy({
    id: "tag",
    label: "Tags",
    source: new URL("./data/tag/", import.meta.url),
    sourceKind: "json-directory",
    archive: false,
  }),
];
export const configuration = {
  site: defineSite({
    brand: "Editable content",
    defaults: {
      lang: "en",
      headerWidth: "fluid",
      sidebar: { rail: true, defaultOpen: true },
      parts: { content: { utilities: ["py-4"] } },
    },
  }),
  plugins: [
    page({
      source: new URL("./content/page/", import.meta.url),
      taxonomies: bindings,
      routes: { single: "host" },
    }),
    definePlugin({
      apiVersion: 1,
      id: "sample",
      label: "Samples",
      basePath: "/sample",
      contentTypes: [
        {
          id: "sample",
          collection: "sample",
          singleRoute: "single",
          source: {
            kind: "json-directory",
            base: new URL("./data/sample/", import.meta.url),
          },
          taxonomies: bindings,
        },
      ],
      routes: [
        { id: "single", pattern: "/[...slug]", owner: "host", prerender: true },
      ],
    }),
  ],
  taxonomies,
};
