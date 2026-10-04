import { defineConfig } from "astro/config";
import moo from "../../../packages/astro/src/integration/index.js";
import { page } from "../../../packages/astro/src/plugins/page/index.js";

export default defineConfig({ integrations: [moo({ plugins: [page({ routes: { single: "host" } })] })] });
