export function tocItems(items) {
  if (!Array.isArray(items)) throw new TypeError("TOC items must be an array");
  const targets = new Set();
  return Array.from(items, (item) => {
    if (
      !item ||
      typeof item.targetId !== "string" ||
      !item.targetId ||
      /\s/u.test(item.targetId) ||
      typeof item.label !== "string" ||
      !item.label.trim()
    )
      throw new TypeError(
        "TOC items require a nonempty targetId and plain label",
      );
    if (targets.has(item.targetId))
      throw new TypeError("TOC target IDs must be unique");
    targets.add(item.targetId);
    return Object.freeze({ targetId: item.targetId, label: item.label });
  });
}

export function fragmentHref(targetId) {
  return `#${encodeURIComponent(targetId).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
