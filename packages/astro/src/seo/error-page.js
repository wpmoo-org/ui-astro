// The one error-page rule. Layout writes robots noindex and drops JSON-LD on
// these pages, and the sitemap scan never lists them, so the two cannot
// diverge. No imports: the sitemap scan runs in plain Node.

/** The status codes, and the last path segment, of an error page. */
export const errorPageCodes = Object.freeze(["404", "500"]);

const trimSlashes = (value) => String(value ?? "").replace(/^\/+|\/+$/gu, "");

/**
 * Whether path is an error page: `404` or `500`, alone or behind exactly one
 * locale prefix from locales (`de/404`), after base. Both built forms match:
 * `/404`, `/404/`, `/404.html`, `/404/index.html`, `/de/404/` ... A path that
 * starts with base (`/docs/404` under base `/docs`) loses it first; a path
 * that does not is read as already relative to base. Anything else is not an
 * error page: `/blog/404`, `/de/404/x`, `/404x`, an unknown locale prefix.
 * @param {string} path
 * @param {{ base?: string, locales?: readonly string[] }} [options]
 * @returns {boolean}
 */
export function isErrorPagePath(path, { base = "/", locales = [] } = {}) {
  let local = String(path ?? "");
  const mount = trimSlashes(base);
  if (mount && (local === `/${mount}` || local.startsWith(`/${mount}/`))) local = local.slice(mount.length + 1);
  local = trimSlashes(local).replace(/(?:^|\/)index\.html$/u, "").replace(/\.html$/u, "");
  local = trimSlashes(local);
  const segments = local.split("/");
  if (segments.length === 1) return errorPageCodes.includes(segments[0]);
  return segments.length === 2 && locales.includes(segments[0]) && errorPageCodes.includes(segments[1]);
}

/**
 * Whether a page is an error page: its response status is 404 or 500 (when
 * the caller has one) or its path matches isErrorPagePath().
 * @param {{ path: string, base?: string, locales?: readonly string[], status?: number }} input
 * @returns {boolean}
 */
export function isErrorPage({ path, base = "/", locales = [], status }) {
  if (errorPageCodes.includes(String(status))) return true;
  return isErrorPagePath(path, { base, locales });
}
