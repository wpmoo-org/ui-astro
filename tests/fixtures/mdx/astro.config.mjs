import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";
import { taxonomies, bindings } from "./src/definitions.js";

export default defineConfig({
  site: "https://mixed.example.test",
  integrations: [
    mdx(),
    moo({
      plugins: [
        page({ formats: ["md", "mdx"], taxonomies: bindings }),
        post({ formats: ["md", "mdx"], taxonomies: bindings }),
      ],
      taxonomies,
    }),
  ],
});
