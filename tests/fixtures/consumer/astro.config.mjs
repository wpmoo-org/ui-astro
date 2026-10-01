import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { defineSite, resolvePageOptions } from "@wpmoo/astro/config";

const options = resolvePageOptions(
  defineSite({ defaults: { headerWidth: null, sidebar: { rail: false } } }),
  "page",
  "single",
);
if (options.headerWidth !== null || options.sidebar.rail !== false) {
  throw new Error("The public config import did not preserve explicit overrides");
}

export default defineConfig({
  site: "https://example.test",
  integrations: [moo({ plugins: [page()], site: {
    defaults: { parts: { content: { utilities: ["py-3", "py-md-5"] }, header: { utilities: ["bg-body-tertiary", "border-bottom"] } } },
    types: { page: { sidebar: {} } },
  } })],
});
