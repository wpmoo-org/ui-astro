const attribute = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
export function namespaceHeadingIds(html, headings, namespace) {
  const ids = new Map(
    headings.map(({ slug }) => [
      attribute(slug),
      attribute(`${namespace}-${slug}`),
    ]),
  );
  if (!ids.size) return html;
  // Only native prose heading IDs and their local anchors change. Preserve raw scripts/styles.
  return html
    .split(
      /(<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>|<!--[\s\S]*?-->)/gi,
    )
    .map((part) => {
      if (/^<(?:script|style)\b|^<!--/i.test(part)) return part;
      return part
        .replace(/<h[1-6]\b[^>]*>/gi, (tag) =>
          tag.replace(/\bid=("|')([^"']*)\1/g, (value, quote, id) =>
            ids.has(id) ? `id=${quote}${ids.get(id)}${quote}` : value,
          ),
        )
        .replace(/<a\b[^>]*>/gi, (tag) =>
          tag.replace(/\bhref=("|')#([^"']*)\1/g, (value, quote, id) =>
            ids.has(id) ? `href=${quote}#${ids.get(id)}${quote}` : value,
          ),
        );
    })
    .join("");
}
