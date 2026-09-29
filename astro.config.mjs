import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";

export default defineConfig({
  integrations: [moo({ site: { defaults: { lang: "tr" }, types: { page: { sidebar: {} } } } })],
  server: {
    host: true,
    port: 4322,
  },
});
