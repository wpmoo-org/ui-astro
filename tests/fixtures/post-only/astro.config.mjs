import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { post } from "@wpmoo/astro/plugins/post";

export default defineConfig({
  base: "/docs",
  trailingSlash: "always",
  integrations: [
    moo({ site: { seo: { sitemap: false, robots: false } }, plugins: [post({ label: "News", basePath: "/news" })] }),
  ],
});
