import { defineTaxonomy } from "@wpmoo/astro/taxonomies";
import { fileURLToPath } from "node:url";

// The host shares the same selected definitions with Astro and its content config.
export const taxonomies = [
  defineTaxonomy({ id: "category", label: "Categories", source: new URL("./data/category.json", import.meta.url), hierarchical: true, archive: { include: "descendants" } }),
  defineTaxonomy({ id: "tag", label: "Tags", source: new URL("./data/tag.json", import.meta.url), archive: {} }),
  defineTaxonomy({ id: "sector", label: "Sectors", source: new URL("./data/sector/", import.meta.url), sourceKind: "json-directory", archive: {} }),
];
export const bindings = taxonomies.map(taxonomy => taxonomy.id);
export const termFilePaths = Object.fromEntries(taxonomies.filter(taxonomy => taxonomy.sourceKind === "json")
  .map(taxonomy => [taxonomy.id, fileURLToPath(taxonomy.source)]));
