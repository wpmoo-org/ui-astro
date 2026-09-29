import { defineConfig } from "astro/config";
import moo from "../../../src/integration/index.js";

const mode = process.env.ASTRO_PAGE_BASE_MODE ?? "directory";
if (!["directory", "file", "ignore"].includes(mode)) throw new Error("Unsupported Page fixture mode");
const format = mode === "file" ? "file" : "directory";

export default defineConfig({
  base: "/docs",
  trailingSlash: mode === "directory" ? "always" : mode === "file" ? "never" : "ignore",
  build: { format },
  integrations: [moo({
    site: {
      brand: "Moo",
      defaults: { lang: "tr" },
      types: { page: { sidebar: {}, pageWidth: "xl" } },
    },
  })],
});
