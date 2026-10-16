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
        defaults: { theme: "dark" },
        types: {
          page: {
            views: { single: { parts: { content: { utilities: [] } } } },
          },
        },
      },
      notFound: {
        routeOwner: "host",
        messages: {
          de: { title: '<script>alert("copy")</script>', homeLabel: "Zurück" },
        },
      },
    }),
  ],
});
