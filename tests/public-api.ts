import type { AstroIntegration } from "astro";
import type { ComponentProps } from "astro/types";
import moo from "@wpmoo/astro";
import Layout from "@wpmoo/astro/Layout.astro";
import Button from "@wpmoo/astro/components/Button.astro";
import { defineSite, resolvePageOptions, getEntryClasses, getPageClasses, normalizeSlug, layoutSchema } from "@wpmoo/astro/config";
import type { SiteInput, SiteConfig, ViewKind, PageOptionsInput, PageOptions, TypeOptionsInput, EntryClassContext, PageClassContext } from "@wpmoo/astro/config";
import { entrySchema, sourceEntryId, jsonEntryId } from "@wpmoo/astro/content";
import type { Entry, PublicationStatus } from "@wpmoo/astro/content";
import { definePlugin } from "@wpmoo/astro/plugins";
import type { PluginInput, Plugin } from "@wpmoo/astro/plugins";
import { page } from "@wpmoo/astro/plugins/page";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
import { getPagePaths, getPublishedPages } from "@wpmoo/astro/plugins/page/queries";
import { getSiteContext, getSiteNavigation, getEntryHref, validateSiteContent } from "@wpmoo/astro/context";
import MooUI, { Chart, Combobox, ContextMenu, DataTable, Datepicker, MooCalendar, MooDateRangePicker, Sidebar, Slider } from "@wpmoo/astro/runtime/moo-ui.js";

type LocalSiteOptions = SiteInput;
export const single: ViewKind = "single";
export const typeOptions: TypeOptionsInput = { sidebar: {}, views: { single: { sidebar: null } } };
export const input: LocalSiteOptions = { brand: "Moo", types: { page: typeOptions } };
export const site: SiteConfig = defineSite(input);
export const override: PageOptionsInput = { sidebar: { defaultOpen: false }, headerWidth: null };
export const resolved: Readonly<PageOptions> = resolvePageOptions(site, "page", single, override);
export const entryContext: EntryClassContext = { type: "page", id: "contact.md", source: "markdown" };
export const pageContext: PageClassContext = { view: "single", entry: entryContext };
export const classes: readonly string[] = [...getEntryClasses(entryContext), ...getPageClasses(pageContext)];
export const slug: string = normalizeSlug("İletişim", { lang: "tr" });
export const parsedLayout: PageOptionsInput = layoutSchema.parse(override);
export const status: PublicationStatus = "publish";
export const content: Entry = entrySchema.parse({ title: "Contact", status });
export const sourceId: string = sourceEntryId({ entry: "contact.md" });
export const jsonId: string = jsonEntryId({ entry: "alice.json", data: { id: "alice" } });
export const descriptorInput: PluginInput = {
  apiVersion: 1, id: "sample", label: "Sample", basePath: "/sample",
  contentTypes: [{ id: "sample", collection: "sample", singleRoute: "single", source: { kind: "json-directory", base: new URL("file:///tmp/sample/") } }],
  routes: [{ id: "single", pattern: "/[...slug]", owner: "host", prerender: true }],
};
export const descriptor: Plugin = definePlugin(descriptorInput);
export const integration: AstroIntegration = moo({ site: input, plugins: [page()] });
export const button: ComponentProps<typeof Button> = { label: "Expand", ariaExpanded: false, size: "sm" };
export const layout: ComponentProps<typeof Layout> = { title: "Contact", sidebar: false, pageContext };
export const parsedPage = pageSchema.parse({ title: "Contact", status, layout: override });
export const publicServerFunctions = { getPagePaths, getPublishedPages, getSiteContext, getSiteNavigation, getEntryHref, validateSiteContent };
export function initializeRuntime(root: Element) {
  for (const ctor of [Chart, Combobox, ContextMenu, DataTable, Datepicker, MooCalendar, MooDateRangePicker, Sidebar, Slider]) {
    ctor.getOrCreateInstance(root).dispose();
  }
  MooUI.Sidebar.getInstance(root)?.dispose();
}

// These are compile-only cases: strict public input boundaries must reject them.
// @ts-expect-error Loop is not a layout preference view.
export const invalidView: ViewKind = "loop";
// @ts-expect-error Unsupported widths cannot cross the public contract.
export const invalidWidth: PageOptionsInput = { pageWidth: "wide" };
// @ts-expect-error Entry options cannot select a template file.
export const invalidTemplate: PageOptionsInput = { template: "Single.astro" };
// @ts-expect-error Host routes cannot import a package-owned entrypoint.
export const invalidHostRoute: PluginInput["routes"][number] = { id: "single", pattern: "/[...slug]", owner: "host", prerender: true, entrypoint: new URL("file:///tmp/single.astro") };
// @ts-expect-error The published RC9 runtime has no private component export.
export const invalidRuntime = MooUI.PrivateComponent;
// @ts-expect-error Normalized type Sidebar settings cannot mutate shared site state.
site.types.page.sidebar!.rail = true;
// @ts-expect-error Normalized view Sidebar settings are also immutable.
site.types.page.views!.single!.sidebar!.side = "left";
// @ts-expect-error Resolved Sidebar preferences are immutable.
resolved.sidebar!.defaultOpen = true;
// @ts-expect-error Every preference resolution selects a view explicitly.
resolvePageOptions(site, "page");
