import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";
import { taxonomies, bindings } from "./src/definitions.mjs";
import { sample } from "@wpmoo-test/astro-content";
export default defineConfig({
  base: "/docs",
  trailingSlash: "never",
  integrations: [
    moo({
      site: { brand: "Taxonomy consumer", defaults: { lang: "de" } },
      plugins: [
        page({ taxonomies: bindings }),
        post({ taxonomies: bindings }),
        sample({
          source: new URL("./src/data/sample.json", import.meta.url),
          taxonomies: bindings,
        }),
      ],
      taxonomies,
    }),
  ],
});
