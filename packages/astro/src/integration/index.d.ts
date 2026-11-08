import type { AstroIntegration } from "astro";
import type { SiteInput } from "../config/index.js";
import type { Plugin } from "../plugins/index.js";
import type { Taxonomy } from "../taxonomies/index.js";
import type { NotFoundInput } from "../not-found/index.js";
import type { PlacementInputOptions } from "../placements/index.js";

/** A named thing whose first mention in Markdown content links to `href`. */
export interface TermLink {
  /** Spellings to match as whole words, for example a name and its short form. */
  terms: readonly string[];
  /** A site path (`/partner/x/`) or an https address. */
  href: string;
  /** The content file of the target itself, which then does not link to itself. */
  source?: URL | string;
}

export interface MooInput extends PlacementInputOptions {
  site?: SiteInput;
  plugins?: readonly Plugin[];
  taxonomies?: readonly Taxonomy[];
  taxonomyBasePath?: string;
  taxonomyRoutes?: { archive?: "plugin" | "host" };
  notFound?: NotFoundInput;
  termLinks?: readonly TermLink[];
}

export default function moo(input?: MooInput): AstroIntegration;
