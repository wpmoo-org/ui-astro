import { getSiteContext, validateSiteContent } from "./index.js";
import { getPagePaths } from "../plugins/page/queries.js";
import { getTaxonomyPaths } from "../taxonomies/queries.js";
import {
  resolveTaxonomyArchive,
  taxonomyNamespaces,
} from "../taxonomies/urls.js";
import { localePath } from "../i18n/profile.js";

export async function getRootPaths(options = {}) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(options)) ||
    Object.keys(options).some((key) => key !== "locale")
  )
    throw new TypeError("Root path options support only locale");
  const context = getSiteContext();
  const locale =
    options.locale ?? context.i18n?.defaultLocale ?? context.site.defaults.lang;
  if (
    context.i18n
      ? !context.i18n.locales.includes(locale)
      : locale !== context.site.defaults.lang
  )
    throw new TypeError(`root locale ${String(locale)} is not active`);
  await validateSiteContent();
  const result = [];
  const page = context.plugins.find(
    (plugin) =>
      plugin.id === "page" &&
      (plugin.locales?.[locale]?.basePath ?? plugin.basePath) === "/" &&
      plugin.contentTypes.some(
        (type) => type.id === "page" && type.collection === "page",
      ),
  );
  if (page) {
    const reservedPrefixes = [
      ...context.plugins
        .filter(
          (plugin) =>
            plugin !== page &&
            (plugin.locales?.[locale]?.basePath ?? plugin.basePath) !== "/",
        )
        .map((plugin) => plugin.locales?.[locale]?.basePath ?? plugin.basePath),
      ...taxonomyNamespaces(context, locale),
      ...(context.i18n?.locales.map((value) => `/${value}`) ?? []),
    ];
    for (const path of await getPagePaths({
      lang: locale,
      locale: context.i18n ? locale : undefined,
      reservedPrefixes,
    }))
      result.push({
        params: path.params,
        props: { kind: "page", entry: path.props.entry },
      });
  }
  const root = context.taxonomies.filter(
    (taxonomy) =>
      taxonomy.archive &&
      resolveTaxonomyArchive(taxonomy, {
        lang: locale,
        taxonomyBasePath: context.taxonomyBasePath,
      }).root,
  );
  if (root.length) {
    for (const path of await getTaxonomyPaths({
      locale,
      routePattern: localePath("/[...slug]", locale, context.i18n),
    }))
      result.push({
        params: { slug: path.params.slug },
        props: { kind: "taxonomy", ...path.props },
      });
  }
  return result;
}
