import {
  defineSite,
  getEntryClasses,
  getPageClasses,
  layoutSchema,
  normalizeSlug,
  resolvePageOptions,
  type EntryClassContext,
  type PageClassContext,
  type PageOptions,
  type PageOptionsInput,
  type PartsInput,
  type SiteConfig,
  type SiteTheme,
  type ThemeColorsInput,
  type ThemeFontsInput,
  type ThemeInput,
  type ThemeRadius,
  type SiteInput,
  type TypeOptionsInput,
  type ViewKind,
} from "@wpmoo/astro/config";

const inputs: SiteInput = {
  defaults: { headerWidth: null, sidebar: { rail: false } },
  types: { post: { views: { single: { sidebar: null } } } },
};
const site: SiteConfig = defineSite(inputs);
const view: ViewKind = "single";
const override: PageOptionsInput = { sidebar: { defaultOpen: false } };
const resolved: Readonly<PageOptions> = resolvePageOptions(site, "post", view, override);
const typeInput: TypeOptionsInput = { views: { archive: { pageWidth: "lg" } } };
const entry: EntryClassContext = { type: "post", source: "markdown", id: "news.md" };
const page: PageClassContext = { view: "single", entry };
const classes: readonly string[] = getPageClasses(page);
const entryClasses: readonly string[] = getEntryClasses(entry);
const slug: string = normalizeSlug("İletişim", { lang: "tr" });
const empty: PageOptionsInput = layoutSchema.parse({});

void [resolved, typeInput, classes, entryClasses, slug, empty];

// @ts-expect-error loop is not a public view
const invalidView: ViewKind = "loop";
// @ts-expect-error widths are registered values
const invalidWidth: PageOptionsInput = { pageWidth: "huge" };
// @ts-expect-error nested views are not page preferences
const nestedViews: PageOptionsInput = { views: { single: {} } };
// @ts-expect-error type views accept only Single and Archive
const unknownView: TypeOptionsInput = { views: { loop: {} } };
void [invalidView, invalidWidth, nestedViews, unknownView];

const logoSite: SiteInput = {
  logo: { src: "/logo.svg", inverseSrc: { src: "/logo-inverse.svg" }, alt: "Example", width: 120, height: 32, brandText: false },
};
const darkParts: PartsInput = { header: { surface: "dark" } };
// @ts-expect-error logo requires alt, width and height
const incompleteLogo: SiteInput = { logo: { src: "/logo.svg" } };
// @ts-expect-error surface is a closed set
const badSurface: PartsInput = { header: { surface: "blue" } };
void [logoSite, darkParts, incompleteLogo, badSurface];

const themeSite: SiteInput = {
  theme: {
    colors: { primary: "#016db7", primaryForeground: "#ffffff", inverseSurface: "#0b2545", inverseForeground: "#ffffff" },
    fonts: { body: "Inter, sans-serif", heading: "Georgia, serif" },
    radius: "small",
    typography: "website",
  },
};
const themeTypes: [ThemeInput, ThemeColorsInput, ThemeFontsInput, ThemeRadius, SiteTheme | undefined] = [
  themeSite.theme!, themeSite.theme!.colors!, themeSite.theme!.fonts!, "large", undefined,
];
// @ts-expect-error radius is a closed set
const badRadius: ThemeInput = { radius: "huge" };
// @ts-expect-error colors.primary is required
const noPrimary: ThemeInput = { colors: { inverseSurface: "#0b2545" } };
void [themeSite, themeTypes, badRadius, noPrimary];
