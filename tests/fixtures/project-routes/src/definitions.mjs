import { definePlugin } from "@wpmoo/astro/plugins";
import { defineTaxonomy } from "@wpmoo/astro/taxonomies";

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
        taxonomies: ["category", "tag"],
      },
    ],
    routes: [
      { id: "single", pattern: "/[...slug]", prerender: true, owner: "host" },
    ],
  });
}
export const taxonomies = [
  defineTaxonomy({
    id: "category",
    label: "Categories",
    source: new URL("./data/category.json", import.meta.url),
  }),
  defineTaxonomy({
    id: "tag",
    label: "Tags",
    source: new URL("./data/tag.json", import.meta.url),
  }),
];
