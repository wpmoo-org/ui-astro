import type { APIRoute } from "astro";
import { getRootPaths, getSiteContext } from "@wpmoo/astro/context";
import {
  getTermEntries,
  getTaxonomyPaths,
  type TermItem,
} from "@wpmoo/astro/taxonomies/queries";
export const GET: APIRoute = async () => {
  const context = getSiteContext();
  const locale = context.i18n!.defaultLocale;
  const direct: readonly TermItem[] = await getTermEntries("category", "root", {
    locale,
  });
  const descendants = await getTermEntries("category", "root", {
    include: "descendants",
    locale,
  });
  const empty = await getTermEntries("tag", "empty", { locale });
  const paths = (
    await Promise.all(
      context.i18n!.locales.map((locale) => getTaxonomyPaths({ locale })),
    )
  ).flat();
  const roots = await getRootPaths();

  return Response.json({
    direct: direct.map((item) => item.id),
    descendants: descendants.map((item) => item.id),
    empty: empty.map((item) => item.id),
    hrefs: descendants.map((item) => item.href),
    paths: paths.map((path) => ({
      taxonomy: path.props.taxonomy,
      id: path.props.term.id,
      href: path.props.href,
    })),
    rootKinds: roots.map((path) => ({
      slug: path.params.slug ?? null,
      kind: path.props.kind,
    })),
    context,
  });
};
