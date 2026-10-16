import { getRelativeLocaleUrl } from "virtual:wpmoo-astro/i18n";
import { siteHref } from "../content/paths.js";

export function nativeLocaleHref(path, locale, context) {
  const href = getRelativeLocaleUrl(locale, path.slice(1));
  const mount = context.base === "/" ? "" : context.base.replace(/\/$/u, "");
  if (mount && href !== mount && !href.startsWith(`${mount}/`))
    throw new TypeError(
      `native locale URL ${href} is outside host base ${mount}`,
    );
  // Astro chooses the locale prefix. The existing producer owns canonical slashes.
  const local = href.slice(mount.length).replace(/\/$/u, "") || "/";
  return siteHref(local, context);
}
