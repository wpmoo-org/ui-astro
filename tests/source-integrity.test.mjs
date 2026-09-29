import assert from "node:assert/strict";
import test from "node:test";

import { validateMarkdownSource, validateSelectedCollections } from "../src/content/integrity.js";

const root = new URL("../", import.meta.url);
const base = new URL("../src/content/page/", import.meta.url);

function entry(id) {
  return {
    id, collection: "page", data: { title: id, status: "publish" },
    filePath: `src/content/page/${id}`,
  };
}

const loaded = [entry("contact.md"), entry("draft.md"), entry("guide/setup.md")];

test("the declared native Markdown source matches every exact loaded file and path", async () => {
  await assert.doesNotReject(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], entries: loaded,
  }));
  await assert.doesNotReject(() => validateMarkdownSource({
    collection: "page", root, base: new URL("../src/content/missing/", import.meta.url), formats: ["md"], entries: [],
  }));
});

test("skipped and unexpected entries fail the complete source-set gate", async () => {
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], entries: loaded.slice(1),
  }), /page.*contact\.md.*missing/i);
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], entries: [...loaded, entry("phantom.md")],
  }), /page.*phantom\.md.*undeclared|page.*phantom\.md.*unexpected/i);
});

test("the same ID from another source path cannot impersonate the declared file", async () => {
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"],
    entries: loaded.map((item) => item.id === "contact.md" ? { ...item, filePath: "src/content/other/contact.md" } : item),
  }), /page.*contact\.md.*filePath|page.*contact\.md.*source/i);
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"],
    entries: loaded.map((item) => item.id === "contact.md" ? { ...item, filePath: undefined } : item),
  }), /page.*contact\.md.*filePath|page.*contact\.md.*source/i);
});

test("a selected missing collection fails while an empty declared collection remains valid", () => {
  assert.throws(() => validateSelectedCollections({ page: undefined }, ["page"]), /page.*collection|collection.*page/i);
  assert.throws(() => validateSelectedCollections({}, ["page"]), /page.*collection|collection.*page/i);
  assert.doesNotThrow(() => validateSelectedCollections({ page: { loader: { name: "glob-loader" }, schema: { safeParse() {} } } }, ["page"]));
  assert.doesNotThrow(() => validateSelectedCollections({}, []));
});
