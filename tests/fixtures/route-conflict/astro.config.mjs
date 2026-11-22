import { defineConfig } from "astro/config";
import moo from "../../../packages/astro/src/integration/index.js";

export default defineConfig({ integrations: [moo({ site: { seo: { sitemap: false, robots: false } } })] });
