import { fileURLToPath } from "node:url";
import moo from "../../src/integration/index.js";
import { getDemoMessages } from "../../src/demo/messages.js";

const copy = getDemoMessages("de");

export default {
  root: fileURLToPath(new URL("../..", import.meta.url)),
  outDir: fileURLToPath(new URL("../../node_modules/.cache/preview-de-dist", import.meta.url)),
  integrations: [moo({ site: { defaults: { lang: "de", parts: { header: { skipLabel: copy.skipToContent, breadcrumbLabel: copy.breadcrumb } } }, types: { page: { sidebar: {} } } } })],
};
