import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { sample } from "@wpmoo-test/astro-content";

const source = new URL("./src/data/sample.json", import.meta.url);
export default defineConfig({
  base: "/docs",
  trailingSlash: "always",
  integrations: [
    moo({
      plugins: [sample({ source, taxonomies: [] })],
      site: {
        brand: "External content consumer",
        defaults: { lang: "de", parts: { content: { utilities: ["py-3"] } } },
        types: {
          sample: {
            sidebar: {},
            views: {
              single: { pageWidth: "lg" },
              archive: {
                sidebar: null,
                lang: "en",
                parts: { content: { utilities: [] } },
              },
            },
          },
        },
      },
    }),
  ],
});
