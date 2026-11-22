import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";

export default defineConfig({ integrations: [moo({ site: { seo: { sitemap: false, robots: false } }, plugins: [page()] })] });
