import type { AstroIntegration } from "astro";
import type { SiteInput } from "../config/index.js";
import type { Plugin } from "../plugins/index.js";

export interface MooInput {
  site?: SiteInput;
  plugins?: readonly Plugin[];
}

export default function moo(input?: MooInput): AstroIntegration;
