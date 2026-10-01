import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";

export default defineConfig({
  integrations: [moo({
    site: { types: { page: { sidebar: {} }, post: { sidebar: {}, views: { single: { sidebar: null } } } } },
    plugins: [page({ routes: { single: "host" } }), post()],
  })],
  server: {
    host: true,
    port: 4322,
  },
});
