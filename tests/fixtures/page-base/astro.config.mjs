import { defineConfig } from "astro/config";
import moo from "../../../packages/astro/src/integration/index.js";
import { page } from "@wpmoo/astro/plugins/page";

const mode = process.env.ASTRO_PAGE_BASE_MODE ?? "directory";
if (!["directory", "file", "ignore"].includes(mode)) throw new Error("Unsupported Page fixture mode");
const format = mode === "file" ? "file" : "directory";

export default defineConfig({
  base: "/docs",
  trailingSlash: mode === "directory" ? "always" : mode === "file" ? "never" : "ignore",
  build: { format },
  integrations: [moo({
    plugins: [page()],
    site: {
      brand: "Moo",
      defaults: { lang: "tr" },
      types: { page: { sidebar: {}, pageWidth: "xl" } },
    },
  })],
});
