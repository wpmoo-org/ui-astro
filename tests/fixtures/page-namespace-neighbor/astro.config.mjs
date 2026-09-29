import { defineConfig } from "astro/config";
import moo from "../../../src/integration/index.js";
import { definePlugin } from "../../../src/plugins/index.js";
import { page } from "../../../src/plugins/page/index.js";

const sample = definePlugin({
  apiVersion: 1,
  id: "sample",
  label: "Sample",
  basePath: "/sample",
  contentTypes: [{
    id: "sample", collection: "sample", singleRoute: "single",
    source: { kind: "json-directory", base: new URL("./src/content/sample/", import.meta.url) },
  }],
  routes: [{ id: "single", pattern: "/[...slug]", prerender: true, owner: "host" }],
});

export default defineConfig({ integrations: [moo({ plugins: [page(), sample] })] });
