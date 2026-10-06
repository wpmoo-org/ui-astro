export function matchConditions(conditions, context) {
  if (!conditions) return true;
  const values = {
    views: context.view,
    types: context.type,
    locales: context.locale,
    entries: context.entry?.id,
    translationKeys: context.entry?.translationKey,
  };
  return Object.entries(conditions).every(([key, list]) => {
    if (key !== "terms")
      return values[key] !== undefined && list.includes(values[key]);
    return Object.entries(list).every(([id, terms]) => {
      const assigned =
        context.view === "taxonomy"
          ? context.taxonomy?.id === id
            ? [context.taxonomy.term]
            : []
          : (context.entry?.taxonomies?.[id] ?? []);
      return terms.some((term) => assigned.includes(term));
    });
  });
}

export function selectPlacements(profile, context) {
  return profile.placements
    .filter(
      (placement) =>
        matchConditions(placement.include, context) &&
        !(placement.exclude && matchConditions(placement.exclude, context)),
    )
    .sort((a, b) => a.order - b.order);
}

export function validateResolvedPlacements(placements) {
  const replacements = placements.filter(
    (placement) => placement.mode === "replace",
  );
  if (replacements.length > 1)
    throw new TypeError(
      `Conflicting taxonomy replacement placements: ${replacements.map((placement) => placement.id).join(", ")}`,
    );
}
