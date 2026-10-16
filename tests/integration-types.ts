import moo from "@wpmoo/astro";

moo({ taxonomyRoutes: { archive: "host" } });
moo({ taxonomyRoutes: { archive: "plugin" } });
moo({ taxonomyRoutes: {} });
moo({
  taxonomyRoutes: {
    // @ts-expect-error Taxonomy archives have one explicit route owner.
    archive: "theme",
  },
});
moo({
  taxonomyRoutes: {
    // @ts-expect-error Taxonomy has no Single route ownership option.
    single: "host",
  },
});
moo({
  // @ts-expect-error Null cannot replace the taxonomy route ownership object.
  taxonomyRoutes: null,
});

import { defineTaxonomy } from "@wpmoo/astro/taxonomies";
import {
  getTaxonomyPaths,
  type TaxonomyPath,
} from "@wpmoo/astro/taxonomies/queries";
const category = defineTaxonomy({
  id: "category",
  label: "Categories",
  source: new URL("file:///site/category.json"),
  archive: { basePath: "/c" },
  locales: { de: { basePath: "/kategorie" } },
});
moo({ taxonomies: [category] });
const paths: Promise<TaxonomyPath[]> = getTaxonomyPaths({
  routePattern: "/c/[slug]",
  locale: "en",
});
void paths;

moo({
  notFound: { routeOwner: "plugin", messages: { de: { title: "Fehler" } } },
});
moo({
  notFound: {
    // @ts-expect-error Native errors have only plugin or host ownership.
    routeOwner: "theme",
  },
});
moo({
  notFound: {
    messages: {
      de: {
        // @ts-expect-error Error messages use the published finite fields.
        heading: "Fehler",
      },
    },
  },
});
