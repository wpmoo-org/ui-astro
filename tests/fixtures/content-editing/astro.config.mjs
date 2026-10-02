import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { configuration } from "./src/moo.config.ts";

export default defineConfig({ integrations: [moo(configuration)] });
