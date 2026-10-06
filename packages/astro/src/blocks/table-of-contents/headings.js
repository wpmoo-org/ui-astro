import { array, text } from "../../placements/options.js";

export function filterHeadings(headings, depths = [2, 3]) {
  array(depths, "TOC depths");
  if (
    depths.some((depth) => !Number.isInteger(depth) || depth < 1 || depth > 6)
  )
    throw new TypeError("TOC depths must be integers from 1 to 6");
  return array(headings, "TOC headings", { empty: true })
    .map((heading) => {
      if (
        !Number.isInteger(heading.depth) ||
        heading.depth < 1 ||
        heading.depth > 6
      )
        throw new TypeError("TOC heading depth must be between 1 and 6");
      text(heading.slug, "TOC heading slug");
      text(heading.text, "TOC heading text");
      return { depth: heading.depth, slug: heading.slug, text: heading.text };
    })
    .filter((heading) => depths.includes(heading.depth));
}
