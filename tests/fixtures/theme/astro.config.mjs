import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";

export default defineConfig({
  site: "https://theme.example.test",
  integrations: [
    moo({
      plugins: [
        page({ routes: { single: "host" } }),
        post({ routes: { single: "host", archive: "host" } }),
      ],
      site: {
        brand: "Theme consumer",
        defaults: {
          lang: "de",
          parts: { content: { utilities: ["py-3", "py-md-5"] } },
        },
        types: {
          page: { sidebar: {} },
          post: {
            sidebar: {},
            views: { single: { sidebar: null }, archive: { lang: "en" } },
          },
        },
      },
    }),
  ],
});
