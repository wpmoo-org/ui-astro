import type { AstroIntegration } from "astro";
import type { SiteInput } from "../config/index.js";
import type { Plugin } from "../plugins/index.js";
import type { Taxonomy } from "../taxonomies/index.js";

export interface MooInput {
  site?: SiteInput;
  plugins?: readonly Plugin[];
  taxonomies?: readonly Taxonomy[];
  taxonomyBasePath?: string;
  taxonomyRoutes?: { archive?: "plugin" | "host" };
}

export default function moo(input?: MooInput): AstroIntegration;
