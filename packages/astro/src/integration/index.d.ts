import type { AstroIntegration } from "astro";
import type { SiteInput } from "../config/index.js";
import type { Plugin } from "../plugins/index.js";
import type { Taxonomy } from "../taxonomies/index.js";
import type { NotFoundInput } from "../not-found/index.js";
import type { PlacementInputOptions } from "../placements/index.js";

export interface MooInput extends PlacementInputOptions {
  site?: SiteInput;
  plugins?: readonly Plugin[];
  taxonomies?: readonly Taxonomy[];
  taxonomyBasePath?: string;
  taxonomyRoutes?: { archive?: "plugin" | "host" };
  notFound?: NotFoundInput;
}

export default function moo(input?: MooInput): AstroIntegration;
