import type { AstroIntegration } from "astro";
import type { ComponentProps } from "astro/types";
import moo from "@wpmoo/astro";
import Layout from "@wpmoo/astro/Layout.astro";
import Button from "@wpmoo/astro/components/Button.astro";
import {
  defineSite,
  resolvePageOptions,
  getEntryClasses,
  getPageClasses,
  normalizeSlug,
  layoutSchema,
} from "@wpmoo/astro/config";
import type {
  SiteInput,
  SiteConfig,
  ViewKind,
  PageOptionsInput,
  PageOptions,
  TypeOptionsInput,
  EntryClassContext,
  PageClassContext,
} from "@wpmoo/astro/config";
import { entrySchema, sourceEntryId, jsonEntryId } from "@wpmoo/astro/content";
import type { Entry, PublicationStatus } from "@wpmoo/astro/content";
import { definePlugin } from "@wpmoo/astro/plugins";
import type { PluginInput, Plugin } from "@wpmoo/astro/plugins";
import { page } from "@wpmoo/astro/plugins/page";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
import {
  getPagePaths,
  getPublishedPages,
} from "@wpmoo/astro/plugins/page/queries";
import {
  getSiteContext,
  getSiteNavigation,
  getEntryHref,
  getRootPaths,
  validateSiteContent,
  type SiteContext,
  type NavigationItem,
  type RootPath,
} from "@wpmoo/astro/context";
import MooUI, {
  loadChart,
  initSheets,
  Combobox,
  ContextMenu,
  DataTable,
  Datepicker,
  MooCalendar,
  MooDateRangePicker,
  Sidebar,
  Slider,
} from "@wpmoo/astro/runtime/moo-ui.js";
import { defineTaxonomy, type Taxonomy } from "@wpmoo/astro/taxonomies";
import { termSchema, type Term } from "@wpmoo/astro/taxonomies/content";
import {
  getTaxonomyTerms,
  getTermEntries,
  getTaxonomyPaths,
  type TermItem,
} from "@wpmoo/astro/taxonomies/queries";

type LocalSiteOptions = SiteInput;
export const single: ViewKind = "single";
export const typeOptions: TypeOptionsInput = {
  sidebar: {},
  views: { single: { sidebar: null } },
};
export const input: LocalSiteOptions = {
  brand: "Moo",
  types: { page: typeOptions },
};
export const site: SiteConfig = defineSite(input);
export const override: PageOptionsInput = {
  sidebar: { defaultOpen: false },
  headerWidth: null,
};
export const resolved: Readonly<PageOptions> = resolvePageOptions(
  site,
  "page",
  single,
  override,
);
export const entryContext: EntryClassContext = {
  type: "page",
  id: "contact.md",
  source: "markdown",
};
export const pageContext: PageClassContext = {
  view: "single",
  entry: entryContext,
};
export const classes: readonly string[] = [
  ...getEntryClasses(entryContext),
  ...getPageClasses(pageContext),
];
export const slug: string = normalizeSlug("İletişim", { lang: "tr" });
export const parsedLayout: PageOptionsInput = layoutSchema.parse(override);
export const status: PublicationStatus = "publish";
export const content: Entry = entrySchema.parse({ title: "Contact", status });
export const sourceId: string = sourceEntryId({ entry: "contact.md" });
export const jsonId: string = jsonEntryId({
  entry: "alice.json",
  data: { id: "alice" },
});
export const descriptorInput: PluginInput = {
  apiVersion: 1,
  id: "sample",
  label: "Sample",
  basePath: "/sample",
  contentTypes: [
    {
      id: "sample",
      collection: "sample",
      singleRoute: "single",
      source: { kind: "json-directory", base: new URL("file:///tmp/sample/") },
    },
  ],
  routes: [
    { id: "single", pattern: "/[...slug]", owner: "host", prerender: true },
  ],
};
export const descriptor: Plugin = definePlugin(descriptorInput);
export const integration: AstroIntegration = moo({
  site: input,
  plugins: [page()],
});
export const taxonomy: Taxonomy = defineTaxonomy({
  id: "category",
  label: "Categories",
  source: new URL("file:///tmp/category.json"),
  hierarchical: true,
  archive: { include: "descendants" },
});
export const term: Term = termSchema.parse({
  id: "root",
  name: "Root",
  slug: "Root",
});
export const taxonomyIntegration: AstroIntegration = moo({
  plugins: [page({ taxonomies: [taxonomy.id] })],
  taxonomies: [taxonomy],
  taxonomyBasePath: "/topics",
});
export type MixedItem = TermItem;
export const taxonomyServerFunctions = {
  getTaxonomyTerms,
  getTermEntries,
  getTaxonomyPaths,
};
export const button: ComponentProps<typeof Button> = {
  label: "Expand",
  ariaExpanded: false,
  size: "sm",
};
export const layout: ComponentProps<typeof Layout> = {
  title: "Contact",
  sidebar: false,
  pageContext,
};
export const parsedPage = pageSchema.parse({
  title: "Contact",
  status,
  options: override,
});
export const parsedOptions: PageOptionsInput | undefined = parsedPage.options;
// @ts-expect-error Collection metadata uses options; layout is reserved by Astro.
export const legacyEntryLayout = parsedPage.layout;
export const publicServerFunctions = {
  getPagePaths,
  getPublishedPages,
  getSiteContext,
  getSiteNavigation,
  getEntryHref,
  getRootPaths,
  validateSiteContent,
};
export const publicContext: SiteContext = getSiteContext();
export const publicRootPaths: Promise<RootPath[]> = getRootPaths();
export const publicNavigation: Promise<readonly NavigationItem[]> =
  getSiteNavigation("/contact");
export async function initializeRuntime(root: Element) {
  const Chart = await loadChart();
  for (const ctor of [
    Chart,
    Combobox,
    ContextMenu,
    DataTable,
    Datepicker,
    MooCalendar,
    MooDateRangePicker,
    Sidebar,
    Slider,
  ]) {
    ctor.getOrCreateInstance(root).dispose();
  }
  MooUI.Sidebar.getInstance(root)?.dispose();
  const disposeSheets: () => void = initSheets(root);
  disposeSheets();
  const defaultChart = await MooUI.loadChart();
  defaultChart.getInstance(root)?.dispose();
}

// @ts-expect-error RC10 loads Chart asynchronously rather than exporting it on the aggregate.
void MooUI.Chart;

// These are compile-only cases: strict public input boundaries must reject them.
// @ts-expect-error Loop is not a layout preference view.
export const invalidView: ViewKind = "loop";
// @ts-expect-error Unsupported widths cannot cross the public contract.
export const invalidWidth: PageOptionsInput = { pageWidth: "wide" };
// @ts-expect-error Entry options cannot select a template file.
export const invalidTemplate: PageOptionsInput = { template: "Single.astro" };
// @ts-expect-error Host routes cannot import a package-owned entrypoint.
export const invalidHostRoute: PluginInput["routes"][number] = {
  id: "single",
  pattern: "/[...slug]",
  owner: "host",
  prerender: true,
  entrypoint: new URL("file:///tmp/single.astro"),
};
// @ts-expect-error The published Core runtime has no private component export.
export const invalidRuntime = MooUI.PrivateComponent;
// @ts-expect-error Normalized type Sidebar settings cannot mutate shared site state.
site.types.page.sidebar!.rail = true;
// @ts-expect-error Normalized view Sidebar settings are also immutable.
site.types.page.views!.single!.sidebar!.side = "left";
// @ts-expect-error Resolved Sidebar preferences are immutable.
resolved.sidebar!.defaultOpen = true;
// @ts-expect-error Every preference resolution selects a view explicitly.
resolvePageOptions(site, "page");
// @ts-expect-error Taxonomy sources are immutable normalized strings.
taxonomy.source = "file:///tmp/changed.json";
export const invalidTerm: Term = {
  id: "root",
  name: "Root",
  slug: "root",
  // @ts-expect-error Published terms use stable IDs and do not have draft state.
  draft: true,
};
// @ts-expect-error Unknown membership policies are not a public query contract.
getTermEntries("category", "root", { include: "all" });

import {
  resolveSeoMetadata,
  type SeoRoute,
  type SeoMetadata,
} from "@wpmoo/astro/seo";
export const seoSite = defineSite({
  organization: {
    name: "Example Foundation",
    names: { de: "German foundation" },
  },
  seo: {
    titleTemplates: {
      types: { post: { single: "{title} | {organization.name}" } },
    },
  },
});
export const seoRoute: SeoRoute = {
  title: "Article",
  status: "publish",
  type: "post",
  view: "single",
  url: "https://example.test/posts/article",
  published_at: new Date("2026-09-28T12:00:00Z"),
};
export const seoMetadata: SeoMetadata | null = resolveSeoMetadata(
  seoSite,
  seoRoute,
);
export const invalidSeoRoute: SeoRoute = {
  title: "Article",
  // @ts-expect-error Publication is explicit and cannot be replaced by a draft flag.
  draft: false,
  view: "single",
  url: "https://example.test/article",
};
export const invalidSeoTemplates = defineSite({
  seo: {
    titleTemplates: {
      types: {
        post: {
          // @ts-expect-error SEO templates support Single and Archive, not Loop.
          loop: "{title}",
        },
      },
    },
  },
});
// @ts-expect-error Resolved publisher data is immutable.
seoMetadata!.jsonLd.publisher!.name = "Changed";

import {
  getLocaleHref,
  getRouteLocale,
  getLanguageLinks,
  type LanguageLink,
} from "@wpmoo/astro/i18n";
export const localizedSite = defineSite({
  locales: {
    de: {
      dir: "rtl",
      parts: { loop: { emptyText: "Localized empty state." } },
    },
  },
});
export const localizedOptions = resolvePageOptions(
  localizedSite,
  "page",
  "single",
  undefined,
  "de",
);
export const localizedContent: Entry = entrySchema.parse({
  title: "Contact",
  status: "publish",
  locale: "de",
  translationKey: "contact",
});
export const languageServerFunctions = {
  getLocaleHref,
  getRouteLocale,
  getLanguageLinks,
};
export const languageLinks: readonly LanguageLink[] = [
  { locale: "de", href: "/de/contact" },
];
// @ts-expect-error Locale preferences are deeply immutable after definition.
localizedSite.locales!.de.parts!.loop!.emptyText = "Changed";
// @ts-expect-error Language links preserve the validated published projection.
languageLinks[0].href = "/missing";
// @ts-expect-error Unknown Page query preferences are outside the public contract.
getPublishedPages({ language: "de" });
