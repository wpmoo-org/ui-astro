import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";
import { taxonomies, bindings } from "./demo/definitions.js";
import { getDemoMessages } from "./demo/messages.js";

const i18n = {
  locales: ["en", "de"],
  defaultLocale: "en",
  routing: { prefixDefaultLocale: false },
};
const localePreferences = Object.fromEntries(
  i18n.locales.map((locale) => {
    const copy = getDemoMessages(locale);
    return [
      locale,
      {
        parts: {
          header: {
            toggleLabel: copy.toggleSidebar,
            navigationLabel: copy.siteNavigation,
            breadcrumbLabel: copy.breadcrumb,
            skipLabel: copy.skipToContent,
          },
          loop: {
            emptyText: copy.emptyItems,
            pageEmptyText: copy.emptyPages,
            postEmptyText: copy.emptyPosts,
            pageTitle: copy.pages,
            postTitle: copy.posts,
          },
        },
      },
    ];
  }),
);

export default defineConfig({
  site: "https://example.test",
  srcDir: "./demo",
  i18n,
  integrations: [
    mdx(),
    moo({
      site: {
        brand: "Moo UI Astro",
        defaults: { lang: i18n.defaultLocale, theme: "dark", sidebar: {} },
        locales: localePreferences,
      },
      plugins: [
        page({
          formats: ["md", "mdx"],
          routes: { single: "host" },
          taxonomies: bindings,
        }),
        post({
          label: getDemoMessages(i18n.defaultLocale).posts,
          formats: ["md", "mdx"],
          routes: { single: "host", archive: "host" },
          taxonomies: bindings,
          locales: Object.fromEntries(
            i18n.locales.map((locale) => [
              locale,
              { label: getDemoMessages(locale).posts },
            ]),
          ),
        }),
      ],
      taxonomies,
      taxonomyRoutes: { archive: "host" },
    }),
  ],
  server: {
    host: true,
    port: 4322,
  },
});
