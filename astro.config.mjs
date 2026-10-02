import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";
import { taxonomies, bindings } from "./demo/definitions.js";

export default defineConfig({
  srcDir: "./demo",
  integrations: [moo({
    site: { brand: "Moo UI Astro", defaults: { theme: "dark" }, types: { page: { sidebar: {} }, post: { sidebar: {}, views: { single: { sidebar: null } } }, category: { sidebar: {} }, tag: { sidebar: {} }, sector: { sidebar: {} } } },
    plugins: [page({ routes: { single: "host" }, taxonomies: bindings }), post({ taxonomies: bindings })],
    taxonomies,
  })],
  server: {
    host: true,
    port: 4322,
  },
});
