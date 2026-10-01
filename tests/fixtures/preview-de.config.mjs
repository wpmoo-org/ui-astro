import { fileURLToPath } from "node:url";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";
import { getDemoMessages } from "../../demo/messages.js";

const copy = getDemoMessages("de");

export default {
  root: fileURLToPath(new URL("../..", import.meta.url)),
  srcDir: "./demo",
  outDir: fileURLToPath(new URL("../../node_modules/.cache/preview-de-dist", import.meta.url)),
  integrations: [moo({
    site: { defaults: { lang: "de", parts: { header: { skipLabel: copy.skipToContent, breadcrumbLabel: copy.breadcrumb } } }, types: { page: { sidebar: {} } } },
    plugins: [page({ routes: { single: "host" } }), post()],
  })],
};
