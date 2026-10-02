import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";
import { taxonomies, bindings } from "./src/definitions.mjs";

export default defineConfig({
  base: "/docs",
  trailingSlash: "always",
  integrations: [
    moo({
      site: { brand: "Taxonomy consumer", defaults: { lang: "en" } },
      plugins: [page({ taxonomies: bindings }), post({ taxonomies: bindings })],
      taxonomies,
    }),
  ],
});
