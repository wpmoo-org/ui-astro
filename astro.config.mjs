import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";

export default defineConfig({
  integrations: [moo({
    site: { types: { page: { sidebar: {} } } },
    plugins: [page({ routes: { single: "host" } })],
  })],
  server: {
    host: true,
    port: 4322,
  },
});
