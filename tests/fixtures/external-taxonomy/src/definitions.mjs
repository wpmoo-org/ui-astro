import { defineTaxonomy } from "@wpmoo/astro/taxonomies";
export const bindings = ["category", "tag", "sector"];
export const taxonomies = [
  defineTaxonomy({
    id: "category",
    label: "Categories",
    source: new URL("./data/category.json", import.meta.url),
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
    archive: { include: "descendants", basePath: "/s" },
  }),
];
