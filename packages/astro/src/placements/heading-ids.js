const attribute = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const space = (character) => /[\t\n\f\r ]/.test(character ?? "");

// Advance once through a tag, including quoted attribute values.
function tagEnd(html, start) {
  let quote;
  let unquotedValue = false;
  let valueStart = false;
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (unquotedValue) {
      if (space(character)) unquotedValue = false;
      else if (character === ">") return index + 1;
    } else if (character === ">") return index + 1;
    else if (valueStart && !space(character)) {
      if (character === '"' || character === "'") quote = character;
      else unquotedValue = true;
      valueStart = false;
    } else if (character === "=") valueStart = true;
  }
  return -1;
}

function rawEnd(html, start, name) {
  let index = start;
  while ((index = html.indexOf("</", index)) !== -1) {
    const end = index + 2 + name.length;
    if (
      html.slice(index + 2, end).toLowerCase() === name &&
      (space(html[end]) || html[end] === ">" || html[end] === "/")
    ) {
      const closingEnd = tagEnd(html, end);
      return closingEnd === -1 ? html.length : closingEnd;
    }
    index += 2;
  }
  return html.length;
}

function rewriteAttributes(tag, start, attributeName, ids) {
  const parts = [];
  let copied = 0;
  let index = start;
  while (index < tag.length) {
    while (space(tag[index]) || tag[index] === "/") index++;
    if (index >= tag.length || tag[index] === ">") break;
    const nameStart = index;
    while (
      index < tag.length &&
      !space(tag[index]) &&
      !"=/>".includes(tag[index])
    )
      index++;
    const name = tag.slice(nameStart, index).toLowerCase();
    while (space(tag[index])) index++;
    if (tag[index] !== "=") continue;
    index++;
    while (space(tag[index])) index++;
    const quote =
      tag[index] === '"' || tag[index] === "'" ? tag[index++] : undefined;
    const valueStart = index;
    if (quote) {
      while (index < tag.length && tag[index] !== quote) index++;
    } else {
      while (index < tag.length && !space(tag[index]) && tag[index] !== ">")
        index++;
    }
    const value = tag.slice(valueStart, index);
    const key =
      attributeName === "href" && value.startsWith("#")
        ? value.slice(1)
        : value;
    if (
      name === attributeName &&
      (attributeName !== "href" || value.startsWith("#")) &&
      ids.has(key)
    ) {
      parts.push(
        tag.slice(copied, valueStart),
        (attributeName === "href" ? "#" : "") + ids.get(key),
      );
      copied = index;
    }
    if (quote) index++;
  }
  parts.push(tag.slice(copied));
  return parts.join("");
}

export function namespaceHeadingIds(html, headings, namespace) {
  const ids = new Map(
    headings.map(({ slug }) => [
      attribute(slug),
      attribute(`${namespace}-${slug}`),
    ]),
  );
  if (!ids.size) return html;
  const parts = [];
  const svgContexts = [];
  let index = 0;
  let copied = 0;
  while ((index = html.indexOf("<", index)) !== -1) {
    if (html.startsWith("<!--", index)) {
      const end = html.indexOf("-->", index + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }
    const nameStart = index + (html[index + 1] === "/" ? 2 : 1);
    if (!/[a-z]/i.test(html[nameStart] ?? "")) {
      index++;
      continue;
    }
    let nameEnd = nameStart;
    while (
      nameEnd < html.length &&
      !space(html[nameEnd]) &&
      !"/>".includes(html[nameEnd])
    )
      nameEnd++;
    const name = html.slice(nameStart, nameEnd).toLowerCase();
    const end = tagEnd(html, nameEnd);
    // Preserve an incomplete tag and its remainder without rescanning suffixes.
    if (end === -1) break;
    const closing = html[index + 1] === "/";
    const selfClosing = html[end - 2] === "/";
    if (closing) {
      if (svgContexts.at(-1)?.name === name) svgContexts.pop();
    } else {
      const inSvg = svgContexts.at(-1)?.svg ?? false;
      if (!selfClosing) {
        if (name === "svg") svgContexts.push({ name, svg: true });
        else if (inSvg && ["foreignobject", "desc", "title"].includes(name)) {
          svgContexts.push({ name, svg: false });
        }
      }
      if (["script", "style"].includes(name)) {
        index = inSvg && selfClosing ? end : rawEnd(html, end, name);
        continue;
      }
      if (/^h[1-6]$/.test(name) || name === "a") {
        parts.push(
          html.slice(copied, index),
          rewriteAttributes(
            html.slice(index, end),
            nameEnd - index,
            name === "a" ? "href" : "id",
            ids,
          ),
        );
        copied = end;
      }
    }
    index = end;
  }
  parts.push(html.slice(copied));
  return parts.join("");
}
