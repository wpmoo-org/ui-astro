import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";

export default defineConfig({
  base: "/site",
  trailingSlash: "always",
  i18n: {
    locales: ["en", "de"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    moo({
      plugins: [],
      site: {
        brand: "Recovery",
        types: {
          page: {
            sidebar: {},
            views: { single: { parts: { content: { utilities: ["py-2"] } } } },
          },
        },
      },
    }),
  ],
});
