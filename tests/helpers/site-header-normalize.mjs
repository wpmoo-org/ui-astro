// Normalizes rendered HTML for the Core/Astro site header parity check.
// Collapses whitespace runs to one space (text-boundary spaces are kept;
// whitespace-only text between tags is dropped), sorts attributes, treats a valueless attribute as
// empty (`alt` equals `alt=""`), expands self-closing tags (`<path/>` equals
// `<path></path>`) and drops Astro scoping attributes, development source
// annotations and the root-dependent src of hoisted module scripts. Same logic as the
// extractor used to produce the Core fixture.
const voidTags = new Set(["img", "br", "hr", "input", "meta", "link"]);
const tag = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][^\s>/]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gu;
const attribute = /([^\s=/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gu;

export function normalizeHtml(html) {
  const out = [];
  let last = 0;
  const text = (value) => {
    const t = value.replace(/\s+/gu, " ");
    if (t.trim()) out.push(t);
  };
  for (const match of html.matchAll(tag)) {
    text(html.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[0].startsWith("<!--")) continue;
    const [, closing, name, rest, selfClosing] = match;
    const lower = name.toLowerCase();
    if (closing) {
      out.push(`</${lower}>`);
      continue;
    }
    const attrs = [];
    for (const a of rest.matchAll(attribute)) {
      if (a[1].startsWith("data-astro-cid") || a[1].startsWith("data-astro-source")) continue;
      const value = a[2] ?? a[3] ?? a[4] ?? "";
      if (lower === "script" && a[1] === "src" && value.includes("?astro&type=script")) continue;
      attrs.push(`${a[1]}="${value}"`);
    }
    attrs.sort();
    out.push(`<${lower}${attrs.map((a) => ` ${a}`).join("")}>`);
    if (selfClosing && !voidTags.has(lower)) out.push(`</${lower}>`);
  }
  text(html.slice(last));
  return `${out.join("\n")}\n`;
}

// Fixtures are stored with trailing spaces and tabs stripped at each line end
// (the pre-commit hook rejects them), so they are not byte-identical to the
// normalized output; comparisons apply the same strip to the SDK side. The
// fixtures hold no <pre> or <textarea>, where this would change content.
export function stripLineEnds(text) {
  return text.replace(/[ \t]+$/gmu, "");
}

// Exactly one <nav>; any other count is an error.
export function extractNav(html) {
  const opens = [...html.matchAll(/<nav[\s>]/gu)];
  const matches = [...html.matchAll(/<nav[\s\S]*?<\/nav>/gu)];
  if (opens.length !== 1 || matches.length !== 1) {
    throw new Error(`expected exactly one <nav>, found ${opens.length}`);
  }
  return matches[0][0];
}
