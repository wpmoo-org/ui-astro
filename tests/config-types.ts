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
  type SiteConfig,
  type SiteInput,
  type TypeOptionsInput,
  type ViewKind,
} from "@wpmoo/astro/config";

const inputs: SiteInput = {
  defaults: { headerWidth: null, sidebar: { rail: false } },
  types: { post: { views: { single: { navigation: "none" } } } },
};
const site: SiteConfig = defineSite(inputs);
const view: ViewKind = "single";
const override: PageOptionsInput = { navigation: "sidebar", sidebar: { defaultOpen: false } };
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
