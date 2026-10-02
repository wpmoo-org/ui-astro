import type { APIRoute } from "astro";
import { getSiteContext } from "@wpmoo/astro/context";
import {
  getTermEntries,
  getTaxonomyPaths,
  type TermItem,
} from "@wpmoo/astro/taxonomies/queries";
export const GET: APIRoute = async () => {
  const direct: readonly TermItem[] = await getTermEntries("category", "root");
  const descendants = await getTermEntries("category", "root", {
    include: "descendants",
  });
  const empty = await getTermEntries("tag", "empty");
  const paths = await getTaxonomyPaths();
  const sectorDirect = await getTermEntries("sector", "foundation");
  const sectorDescendants = await getTermEntries("sector", "foundation", {
    include: "descendants",
  });
  const sectorEmpty = await getTermEntries("sector", "empty");
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
    context: getSiteContext(),
    sectorDirect: sectorDirect.map((item) => item.id),
    sectorDescendants: sectorDescendants.map((item) => item.id),
    sectorEmpty: sectorEmpty.map((item) => item.id),
    sectorHrefs: sectorDescendants.map((item) => item.href),
  });
};
