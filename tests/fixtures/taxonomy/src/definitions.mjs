import { definePlugin } from "@wpmoo/astro/plugins";
import { defineTaxonomy } from "@wpmoo/astro/taxonomies";
export const bindings = ["category", "tag", "sector"];
export const taxonomies = [
  defineTaxonomy({
    id: "category",
    label: "Categories",
    source: new URL("./data/category.json", import.meta.url),
    locales: { de: { label: "Kategorien", basePath: "/kategorie" } },
    hierarchical: true,
    archive: { include: "descendants", basePath: "/category" },
  }),
  defineTaxonomy({
    id: "tag",
    label: "Tags",
    source: new URL("./data/tag.json", import.meta.url),
    archive: { basePath: "/" },
  }),
  defineTaxonomy({
    id: "sector",
    label: "Sectors",
    source: new URL("./data/sector.json", import.meta.url),
    hierarchical: true,
    archive: { include: "descendants", basePath: "/" },
  }),
];

/** @returns {import("@wpmoo/astro/plugins").Plugin} */
export function projects() {
  return definePlugin({
    apiVersion: 1,
    id: "projects",
    label: "Projects",
    basePath: "/project",
    locales: { de: { label: "Projekte", basePath: "/projekt" } },
    contentTypes: [
      {
        id: "project",
        collection: "project",
        singleRoute: "single",
        source: {
          kind: "markdown",
          formats: ["md"],
          base: new URL("./content/project/", import.meta.url),
        },
        taxonomies: bindings,
      },
    ],
    routes: [
      { id: "single", pattern: "/[...slug]", prerender: true, owner: "host" },
    ],
  });
}
