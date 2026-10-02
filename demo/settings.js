import { getSiteContext } from "@wpmoo/astro/context";
import { resolvePageOptions } from "@wpmoo/astro/config";

// These authored example choices belong to the host, outside the npm package.
export const demoControls = Object.freeze({
  action: Object.freeze({ variant: "ghost", size: "sm", class: "ms-auto" }),
  sidebarFooterUtilities: Object.freeze(["small", "text-body-secondary"]),
});

export function getDemoOptions(type = "page", view = "single", overrides = {}) {
  return resolvePageOptions(getSiteContext().site, type, view, overrides);
}

/** @returns {import("@wpmoo/astro/config").EntryClassContext} */
export function getDemoEntryContext(type, entry) {
  return { type, id: entry.id, source: "markdown", ...(entry.data.taxonomies ? {
    taxonomies: Object.fromEntries(Object.entries(entry.data.taxonomies).map(([id, refs]) => [id, refs.map(ref => ref.id)])),
  } : {}) };
}
