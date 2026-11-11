/** A plain string, or one text per locale such as { en: "…", de: "…" }. */
export type ConsentText = string | Readonly<Record<string, string>>;

export interface ConsentStorage {
  readonly name: string;
  readonly type: "cookie" | "local" | "session" | "pixel";
  readonly lifetime?: ConsentText;
}

export interface ConsentService {
  readonly id: string;
  readonly name: ConsentText;
  readonly provider?: ConsentText;
  readonly purpose?: ConsentText;
  readonly privacyUrl?: string;
  readonly storage?: readonly ConsentStorage[];
}

export interface ConsentCategory {
  /** functional (the only required one), statistics, marketing, external_media or a site slug. */
  readonly id: string;
  readonly label: ConsentText;
  readonly description?: ConsentText;
  readonly required?: boolean;
  readonly services?: readonly ConsentService[];
}

export interface ConsentConfig {
  /** Omit to compute Core's rule from the shown category and service ids at build time. */
  readonly revision?: string;
  /** Raise to ask every visitor again after a material change. */
  readonly reask?: number;
  readonly cookie?: { readonly name?: string; readonly days?: number };
  readonly logo?: { readonly src: string; readonly alt?: string; readonly height?: number };
  readonly links?: readonly { readonly label: ConsentText; readonly href: string }[];
  readonly categories: readonly ConsentCategory[];
}

export interface ConsentLabels {
  title: string;
  text: string;
  acceptAll: string;
  decline: string;
  save: string;
  alwaysActive: string;
  provider: string;
  purpose: string;
  storage: string;
  privacy: string;
  service: string;
  links: string;
  settings: string;
  load: string;
  remember: string;
  types: Record<ConsentStorage["type"], string>;
}

export declare const STORAGE_TYPES: readonly ConsentStorage["type"][];
export declare function localize(value: ConsentText | undefined | null, locale?: string): string;
export declare function consentLabels(
  locale?: string,
  overrides?: Partial<Omit<ConsentLabels, "types">> & { types?: Partial<ConsentLabels["types"]> },
): ConsentLabels;
export declare function shownCategories(config: ConsentConfig): ConsentCategory[];
export declare function revisionOf(config: ConsentConfig): string;
export declare function runtimeConfig(config: ConsentConfig): unknown;
export declare function scriptJson(value: unknown): string;
