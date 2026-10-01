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
