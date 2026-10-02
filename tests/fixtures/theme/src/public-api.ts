import {
  defineSite,
  resolvePageOptions,
  getEntryClasses,
  getPageClasses,
  layoutSchema,
  type SiteInput,
  type SiteConfig,
  type ViewKind,
  type PageOptionsInput,
  type PageOptions,
  type TypeOptionsInput,
  type EntryClassContext,
  type PageClassContext,
} from "@wpmoo/astro/config";
import {
  definePlugin,
  type PluginInput,
  type Plugin as ContentPlugin,
} from "@wpmoo/astro/plugins";
import {
  getSiteContext,
  getSiteNavigation,
  getEntryHref,
  type SiteContext,
  type NavigationItem,
} from "@wpmoo/astro/context";
import { defineTaxonomy, type Taxonomy } from "@wpmoo/astro/taxonomies";
import { termSchema, type Term } from "@wpmoo/astro/taxonomies/content";
import { getTermEntries, type TermItem } from "@wpmoo/astro/taxonomies/queries";
import {
  getPublishedPages,
  getPagePaths,
} from "@wpmoo/astro/plugins/page/queries";
import {
  getPublishedPosts,
  getPostPaths,
} from "@wpmoo/astro/plugins/post/queries";

const view: ViewKind = "single";
const input: PageOptionsInput = { sidebar: null, headerWidth: null };
const type: TypeOptionsInput = { views: { [view]: input } };
const siteInput: SiteInput = { types: { page: type } };
const site: SiteConfig = defineSite(siteInput);
export const resolved: PageOptions = resolvePageOptions(
  site,
  "page",
  view,
  layoutSchema.parse(input),
);
const entry: EntryClassContext = {
  type: "page",
  id: "about.md",
  source: "markdown",
};
const page: PageClassContext = { view: "single", entry };
export const classes = [...getEntryClasses(entry), ...getPageClasses(page)];

const pluginInput: PluginInput = {
  apiVersion: 1,
  id: "sample",
  label: "Samples",
  basePath: "/sample",
  contentTypes: [
    {
      id: "sample",
      collection: "sample",
      singleRoute: "single",
      source: {
        kind: "json-directory",
        base: new URL("./data/sample/", import.meta.url),
      },
    },
  ],
  routes: [
    { id: "single", pattern: "/[...slug]", prerender: true, owner: "host" },
  ],
};
export const plugin: ContentPlugin = definePlugin(pluginInput);
export const taxonomy: Taxonomy = defineTaxonomy({
  id: "sector",
  label: "Sectors",
  source: new URL("./data/sector.json", import.meta.url),
});
export const term: Term = termSchema.parse({
  id: "foundation",
  name: "Foundation",
  slug: "foundation",
});

export async function publicQueries() {
  const context: SiteContext = getSiteContext();
  const navigation: readonly NavigationItem[] =
    await getSiteNavigation("/about");
  const terms: readonly TermItem[] = await getTermEntries("sector", term.id);
  const pages = await getPublishedPages();
  const posts = await getPublishedPosts();
  return {
    context,
    navigation,
    terms,
    pagePaths: await getPagePaths(),
    postPaths: await getPostPaths(),
    hrefs: [
      ...pages.map((entry) => getEntryHref("page", entry)),
      ...posts.map((entry) => getEntryHref("post", entry)),
    ],
  };
}

// @ts-expect-error Unsupported layout values cannot become theme options.
resolvePageOptions(site, "page", "single", { pageWidth: "wide" });
// @ts-expect-error A plugin API version is an exact public contract.
definePlugin({ ...pluginInput, apiVersion: 2 });
// @ts-expect-error Native route keys use the native context branch.
getPageClasses({ view: "native", entry });
// @ts-expect-error A canonical entry link requires an actual entry identity.
getEntryHref("page", { data: { status: "publish" } });
