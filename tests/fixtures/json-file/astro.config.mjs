import { defineConfig } from "astro/config";
import moo from "../../../src/integration/index.js";
import { definePlugin } from "../../../src/plugins/index.js";

const team = definePlugin({
  apiVersion: 1, id: "team", label: "Team", basePath: "/team",
  contentTypes: [{
    id: "team", collection: "team", singleRoute: "single",
    source: { kind: "json", file: new URL("./src/content/team.json", import.meta.url) },
  }],
  routes: [{ id: "single", pattern: "/[...slug]", prerender: true, owner: "host" }],
});

export default defineConfig({ integrations: [moo({ plugins: [team] })] });
