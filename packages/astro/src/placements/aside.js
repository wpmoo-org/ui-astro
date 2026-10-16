import { defineSite, resolvePageOptions } from "../config/index.js";

const defaults = defineSite();

/** Select data before rendering; content bodies keep their single owner. */
export function selectAsidePlacements(
  plan,
  aside,
  customAside = false,
  compactEnabled = true,
) {
  const resolved = aside
    ? resolvePageOptions(defaults, "page", "single", { aside }).aside
    : null;
  const placements =
    !resolved || customAside
      ? []
      : (plan?.groups["aside.content"] ?? []).filter(
          (placement) => placement.kind !== "toc" || placement.tocItems?.length,
        );
  const split = compactEnabled && resolved?.mobile === "stack-after";
  return {
    placements,
    compact: split
      ? placements.filter((placement) => placement.kind === "toc")
      : [],
    hasMobileBody: placements.some((placement) => placement.kind !== "toc"),
    compactClass: split ? `d-${resolved.breakpoint}-none` : "",
    listClass: split ? `d-none d-${resolved.breakpoint}-block` : "",
  };
}
