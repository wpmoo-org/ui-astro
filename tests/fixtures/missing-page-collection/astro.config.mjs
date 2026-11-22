import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";

export default defineConfig({ integrations: [moo({ site: { seo: { sitemap: false, robots: false } } })] });
