export interface LanguageLink {
  readonly locale: string;
  readonly href: string;
}

/** Uses the public getStaticPaths routePattern supplied by Astro. */
export declare function getRouteLocale(routePattern: string): string;
/** Native Astro locale URL helper for an already canonical, unprefixed local path. */
export declare function getLocaleHref(path: string, locale: string): string;
/** Published same-type translations, including self; standalone entries return no links. */
export declare function getLanguageLinks(
  typeId: string,
  entry: {
    readonly collection: string;
    readonly id: string;
    readonly data: {
      readonly status: string;
      readonly locale?: string;
      readonly translationKey?: string;
      readonly slug?: string;
    };
  },
): Promise<readonly LanguageLink[]>;
