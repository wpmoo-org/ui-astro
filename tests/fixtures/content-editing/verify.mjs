import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import metadata from "./dist/section-metadata.js";

assert.deepEqual(metadata, {
  text: { label: "Text", fields: { heading: "text", text: "text" } },
  action: { label: "Action", fields: { label: "text", href: "link" } },
});
const contract = JSON.parse(
  await readFile(new URL("./dist/content.json", import.meta.url), "utf8"),
);
const raw = JSON.parse(
  await readFile(
    new URL("./src/data/sample/member.json", import.meta.url),
    "utf8",
  ),
);
assert.deepEqual(raw.options, { sidebar: null, headerWidth: null });
assert.deepEqual(raw.taxonomies, { category: ["child"] });
assert.equal(raw.slug, "sample-member");
assert.equal(raw.id, "member");
assert.deepEqual(contract.sample.options, raw.options);
assert.deepEqual(contract.page.options.sidebar, {
  rail: false,
  defaultOpen: false,
});
assert.deepEqual(contract.page.options.parts.content.utilities, []);
assert.equal(Object.hasOwn(contract.page.options, "headerWidth"), false);
assert.equal(Object.hasOwn(contract.plain, "options"), false);
assert.equal(Object.hasOwn(contract.plain, "taxonomies"), false);
assert.deepEqual(contract.page.taxonomies, {
  category: [{ collection: "category", id: "child" }],
  tag: [],
});
assert.deepEqual(contract.hrefs, [
  "/editable",
  "/plain",
  "/sample/sample-member",
]);
assert.equal(contract.page.published_at, "2026-09-20T12:00:00.000Z");
assert.deepEqual(
  contract.page.sections.map((section) => section.id),
  ["intro", "sample-action"],
);
const html = await readFile(
  new URL("./dist/editable/index.html", import.meta.url),
  "utf8",
);
assert.ok(html.includes("Literal &lt;strong&gt;content&lt;/strong&gt;."));
assert.deepEqual(
  [...html.matchAll(/data-section-type="([^"]+)"/gu)].map((match) => match[1]),
  Object.keys(metadata),
);
console.log(
  "Compiled pure section metadata, raw missing/false/null values and canonical output: OK",
);
