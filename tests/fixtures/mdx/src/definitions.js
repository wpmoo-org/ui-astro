import { defineTaxonomy } from "@wpmoo/astro/taxonomies";

export const bindings = ["category", "tag"];
export const taxonomies = [
  defineTaxonomy({
    id: "category",
    label: "Categories",
    source: new URL("./data/category.json", import.meta.url),
    archive: false,
  }),
  defineTaxonomy({
    id: "tag",
    label: "Tags",
    source: new URL("./data/tag.json", import.meta.url),
    archive: false,
  }),
];
