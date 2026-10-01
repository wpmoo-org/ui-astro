import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
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
  integrations: [moo({ site: { types: { page: { sidebar: {} } } } })],
});
