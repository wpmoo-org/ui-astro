import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";
import { taxonomies, bindings } from "./demo/definitions.js";

export default defineConfig({
  site: "https://example.test",
  srcDir: "./demo",
  i18n: {
    locales: ["en", "en-gb"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    mdx(),
    moo({
      site: {
        brand: "Moo UI Astro",
        defaults: { theme: "dark" },
        types: {
          page: { sidebar: {} },
          post: { sidebar: {}, views: { single: { sidebar: null } } },
          category: { sidebar: {} },
          tag: { sidebar: {} },
          sector: { sidebar: {} },
        },
      },
      plugins: [
        page({
          formats: ["md", "mdx"],
          routes: { single: "host" },
          taxonomies: bindings,
        }),
        post({ formats: ["md", "mdx"], taxonomies: bindings }),
      ],
      taxonomies,
    }),
  ],
  server: {
    host: true,
    port: 4322,
  },
});
