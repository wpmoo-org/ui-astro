import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { projects, taxonomies } from "./src/definitions.mjs";
export default defineConfig({
  site: "https://example.test",
  base: "/",
  trailingSlash: "never",
  i18n: { locales: ["en", "de"], defaultLocale: "en" },
  integrations: [moo({ plugins: [projects()], taxonomies })],
});
