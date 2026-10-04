import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";
import { taxonomies, bindings, projects } from "./src/definitions.mjs";

export default defineConfig({
  site: "https://example.test",
  base: "/docs",
  i18n: {
    locales: ["en", "de"],
    defaultLocale: "de",
    routing: { prefixDefaultLocale: false },
  },
  trailingSlash: "always",
  integrations: [
    moo({
      site: { brand: "Taxonomy consumer", defaults: { lang: "de" } },
      plugins: [
        page({ taxonomies: bindings }),
        post({ taxonomies: bindings }),
        projects(),
      ],
      taxonomies,
    }),
  ],
});
