import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import moo from "@wpmoo/astro";
export default defineConfig({
  i18n: {
    locales: ["en", "de"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    mdx(),
    moo({
      plugins: [],
      taxonomies: [],
      blocks: {
        component: {
          component: new URL("./src/components/Callout.astro", import.meta.url),
        },
        content: { collection: "block", translationKey: "cta" },
      },
      placements: [
        {
          id: "component",
          block: "component",
          at: "content.before",
          props: { message: "Component assets" },
        },
        { id: "content", block: "content", at: "content.after" },
        { id: "content-two", block: "content", at: "content.after" },
        { id: "toc", block: "toc", at: "aside.content" },
      ],
    }),
  ],
});
