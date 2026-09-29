import { page, type PageOptions } from "@wpmoo/astro/plugins/page";
import type { Plugin } from "@wpmoo/astro/plugins";

const options: PageOptions = {
  formats: ["md", "mdx"], routes: { single: "host" }, taxonomies: ["category"],
};
const plugin: Plugin = page(options);

// @ts-expect-error Page has no default Archive route
page({ routes: { archive: "host" } });
// @ts-expect-error the supported MDX recipe requires Markdown too
page({ formats: ["mdx"] });

void plugin;
