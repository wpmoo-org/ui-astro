import type { PageOptions } from "../config/index.js";
import type { LanguageLink } from "../i18n/index.js";

export interface NotFoundMessages {
  title: string;
  description: string;
  homeLabel: string;
}

export interface NotFoundInput {
  routeOwner?: "plugin" | "host";
  messages?: Record<string, Partial<NotFoundMessages>>;
}

export interface NotFoundOptions extends Readonly<NotFoundMessages> {
  readonly locale: string;
  readonly brand: string;
  readonly href: string;
  readonly homeHref: string;
  readonly options: Readonly<PageOptions>;
  readonly languageLinks: readonly LanguageLink[];
}

/** Resolves recovery copy and known locale homes without loading collections. */
export declare function getNotFoundOptions(locale?: string): NotFoundOptions;
