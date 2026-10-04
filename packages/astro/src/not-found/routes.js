import { fileURLToPath } from "node:url";
import { localePath } from "../i18n/profile.js";

const entrypoint = fileURLToPath(
  new URL("../integration/routes/404.astro", import.meta.url),
);

/** @param {import('./options.js').NotFoundProfile} profile */
export function notFoundRouteClaims(profile) {
  const patterns = new Set(["/404"]);
  for (const locale of profile.i18n?.locales ?? [profile.site.defaults.lang])
    patterns.add(localePath("/404", locale, profile.i18n));
  return Object.freeze(
    [...patterns].map((pattern) =>
      Object.freeze({
        owner: "not-found",
        pattern,
        routeOwner: profile.notFound.routeOwner,
        entrypoint,
      }),
    ),
  );
}

/** Validate literal native errors independently of collection route ownership. */
export function validateNotFoundRoutes(claims, routes, root) {
  for (const claim of claims) {
    const matches = routes.filter((route) => route.pattern === claim.pattern);
    if (matches.length > 1)
      throw new TypeError(
        `moo not-found route ${claim.pattern} has multiple resolved owners; choose moo.notFound.routeOwner: "host" to provide native error files`,
      );
    const origin = claim.routeOwner === "host" ? "project" : "external";
    const route = matches[0];
    if (!route || route.origin !== origin)
      throw new TypeError(
        `moo not-found requires one ${origin} route at ${claim.pattern}`,
      );
    if (route.type !== "page")
      throw new TypeError(
        `moo not-found route ${claim.pattern} must be a literal page`,
      );
    if (route.isPrerendered !== true)
      throw new TypeError(
        `moo not-found route ${claim.pattern} must prerender`,
      );
    const actualEntrypoint = root
      ? fileURLToPath(new URL(route.entrypoint, root))
      : route.entrypoint;
    if (claim.routeOwner === "plugin" && actualEntrypoint !== claim.entrypoint)
      throw new TypeError(
        `moo not-found route ${claim.pattern} requires its default entrypoint ${claim.entrypoint}`,
      );
  }
}
