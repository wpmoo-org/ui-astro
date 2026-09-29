import { page, type PageOptions } from "@wpmoo/astro/plugins/page";
import type { Plugin } from "@wpmoo/astro/plugins";
import { getEntryClasses } from "@wpmoo/astro/config";
import { pageLoopItems } from "../src/plugins/page/paths.js";

const options: PageOptions = {
  formats: ["md", "mdx"], routes: { single: "host" }, taxonomies: ["category"],
};
const plugin: Plugin = page(options);

// @ts-expect-error Page has no default Archive route
page({ routes: { archive: "host" } });
// @ts-expect-error the supported MDX recipe requires Markdown too
page({ formats: ["mdx"] });

void plugin;

for (const item of pageLoopItems([
  { id: "about.md", collection: "page", data: { title: "About", status: "publish" } },
])) {
  getEntryClasses(item.entryContext);
}
