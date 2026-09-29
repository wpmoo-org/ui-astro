import { defineConfig } from "astro/config";
import moo from "../../../src/integration/index.js";

export default defineConfig({ integrations: [moo()] });
