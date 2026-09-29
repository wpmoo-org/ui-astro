import { fileURLToPath } from "node:url";
import moo from "../../src/integration/index.js";

export default {
  root: fileURLToPath(new URL("../..", import.meta.url)),
  outDir: fileURLToPath(new URL("../../node_modules/.cache/preview-de-dist", import.meta.url)),
  integrations: [moo({ site: { defaults: { lang: "de" }, types: { page: { sidebar: {} } } } })],
};
