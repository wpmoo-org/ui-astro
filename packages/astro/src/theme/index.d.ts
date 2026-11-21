export interface ThemeColorsInput {
  /** `#rrggbb`. Used for buttons and, on light surfaces, links. */
  primary: string;
  /** Defaults to `#ffffff` or `#0a0a0a`, whichever contrasts more with `primary`. */
  primaryForeground?: string;
  /** Dark surface for `parts.header.surface: "dark"`. */
  inverseSurface?: string;
  /** Defaults by contrast with `inverseSurface`; requires it. */
  inverseForeground?: string;
}
export interface ThemeFontsInput {
  /** CSS font-family stack; the site loads the font files. */
  body?: string;
  heading?: string;
}
export type ThemeRadius = "default" | "none" | "small" | "medium" | "large";
export interface ThemeInput {
  colors?: ThemeColorsInput;
  fonts?: ThemeFontsInput;
  radius?: ThemeRadius;
  typography?: "app" | "website";
}
export interface SiteTheme {
  readonly colors?: Readonly<{
    primary: string;
    primaryForeground?: string;
    inverseSurface?: string;
    inverseForeground?: string;
  }>;
  readonly fonts?: Readonly<ThemeFontsInput>;
  readonly radius?: ThemeRadius;
  readonly typography?: "app" | "website";
}
export interface ResolvedTheme {
  readonly fonts: Readonly<ThemeFontsInput>;
  readonly radius: ThemeRadius;
  readonly typography: "app" | "website" | null;
  readonly colors: null | {
    readonly primary: string;
    readonly primaryForeground: string;
    readonly hover: string;
    readonly active: string;
    readonly linkHover: string;
    readonly ring: { readonly light: string; readonly dark: string };
    readonly inverse: null | { readonly surface: string; readonly foreground: string; readonly ring: string };
  };
}
export declare function primaryStateColors(primary: string, foreground: string, surface?: string): { hover: string; active: string };
export declare function readableForeground(background: string): string;
export declare function ringColor(primary: string, surfaces: string | readonly string[]): { ring: string; ratio: number; surface: string; ok: boolean };
export declare function linkHoverColor(primary: string): string;
export declare function contrastRatio(a: readonly number[], b: readonly number[]): number;
export declare function resolveTheme(theme: SiteTheme): ResolvedTheme;
export declare function themeCss(resolved: ResolvedTheme | null | undefined): string;
