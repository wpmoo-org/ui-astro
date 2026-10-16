import { fileURLToPath } from "node:url";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { getDemoMessages } from "../../apps/demo/messages.js";

const copy = getDemoMessages("de");

export default {
  root: fileURLToPath(new URL("../..", import.meta.url)),
  srcDir: fileURLToPath(new URL("./preview-de/src/", import.meta.url)),
  outDir: fileURLToPath(
    new URL("../../node_modules/.cache/preview-de-dist", import.meta.url),
  ),
  integrations: [
    moo({
      site: {
        defaults: {
          lang: "de",
          parts: {
            header: {
              skipLabel: copy.skipToContent,
              breadcrumbLabel: copy.breadcrumb,
            },
          },
        },
        types: { page: { sidebar: {} } },
      },
      plugins: [page()],
    }),
  ],
};
