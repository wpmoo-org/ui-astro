import { defineConfig } from "astro/config";
import moo from "../../../src/integration/index.js";
import { page } from "../../../src/plugins/page/index.js";

export default defineConfig({ integrations: [moo({ plugins: [page({ routes: { single: "host" } })] })] });
